package pipeline

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"

	"github.com/newsprism/batch/internal/db"
	"github.com/newsprism/batch/internal/llm"
)

type groupNaming struct {
	Index int    `json:"index"`
	Title string `json:"title"`
}

type namingResult struct {
	Groups []groupNaming `json:"groups"`
}

// NameClusters calls LLM to assign Japanese titles to each cluster.
// Falls back to keyword-based titles on error.
func NameClusters(ctx context.Context, chatClient *llm.ChatClient, clusters []Cluster) []string {
	titles := make([]string, len(clusters))
	if len(clusters) == 0 {
		return titles
	}

	var clusterList strings.Builder
	for i, c := range clusters {
		cat := dominantCat(c.Articles)
		titleParts := make([]string, 0, len(c.Articles))
		for _, a := range c.Articles {
			titleParts = append(titleParts, "「"+a.Title+"」")
		}

		common := extractCommonKeywords(c.Articles)
		commonLine := ""
		if len(common) > 0 {
			commonLine = "\n  共通キーワード: " + strings.Join(common, "・")
		}

		fmt.Fprintf(&clusterList, "グループ%d（%s）%s\n  記事: %s\n\n",
			i, cat, commonLine, strings.Join(titleParts, " "),
		)
	}

	const system = `各グループの「全記事」が共通して報じている出来事を、20字以内の自然な日本語で命名してください。

命名スタイル:
- 体言止め（名詞句）を基本とする。例:「日銀の利上げ決定」「トランプ関税と円安」
- 述語（〜した・〜される）で終わらせない
- 固有名詞（人名・地名・組織名）は積極的に使う

制約:
- 「共通キーワード」に示した語を中心に命名する
- グループ内の一部の記事にしか当てはまらない内容は含めない

必ずJSON形式のみで回答してください。
出力フォーマット: { "groups": [{ "index": 0, "title": "タイトル" }, ...] }`

	content, err := chatClient.Complete(ctx, system, clusterList.String())
	if err != nil {
		slog.Warn("name clusters LLM error, using fallback", "err", err)
		for i, c := range clusters {
			titles[i] = fallbackTitle(c)
		}
		return titles
	}

	var result namingResult
	if err := json.Unmarshal([]byte(content), &result); err != nil {
		slog.Warn("name clusters JSON parse error, using fallback", "err", err)
		for i, c := range clusters {
			titles[i] = fallbackTitle(c)
		}
		return titles
	}

	titleMap := make(map[int]string, len(result.Groups))
	for _, g := range result.Groups {
		titleMap[g.Index] = g.Title
	}
	for i, c := range clusters {
		if t, ok := titleMap[i]; ok && t != "" {
			titles[i] = t
		} else {
			titles[i] = fallbackTitle(c)
		}
	}
	return titles
}

func fallbackTitle(c Cluster) string {
	common := extractCommonKeywords(c.Articles)
	if len(common) > 0 {
		n := 3
		if len(common) < n {
			n = len(common)
		}
		return strings.Join(common[:n], " ")
	}
	if len(c.Articles) > 0 {
		t := c.Articles[0].Title
		runes := []rune(t)
		if len(runes) > 30 {
			return string(runes[:30])
		}
		return t
	}
	return "不明"
}

// extractCommonKeywords returns words appearing in ≥50% of article titles.
func extractCommonKeywords(articles []db.Article) []string {
	if len(articles) <= 1 {
		return nil
	}
	threshold := len(articles)/2 + 1
	freq := make(map[string]int)

	for _, a := range articles {
		runes := []rune(a.Title)
		seen := make(map[string]bool)
		// Extract n-grams of length 2–6
		for i := 0; i < len(runes); i++ {
			for j := i + 2; j <= i+6 && j <= len(runes); j++ {
				token := string(runes[i:j])
				if !seen[token] {
					freq[token]++
					seen[token] = true
				}
			}
		}
	}

	var common []string
	for token, count := range freq {
		if count >= threshold {
			common = append(common, token)
		}
	}
	if len(common) > 6 {
		common = common[:6]
	}
	return common
}
