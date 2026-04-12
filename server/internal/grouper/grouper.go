package grouper

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/newsprism/shared/db"
	"github.com/newsprism/shared/llm"
)

type NewsGroup struct {
	GroupTitle   string       `json:"groupTitle"`
	Items        []db.Article `json:"items"`
	SingleOutlet bool         `json:"singleOutlet"`
	Category     string       `json:"category"`
	Subcategory  string       `json:"subcategory"`
}

type Cluster struct {
	Centroid    []float32
	Articles    []db.Article
	DomCate     string
	vecCount    int // number of articles with embeddings contributing to centroid
}

func GroupArticlesByEvent(ctx context.Context, chatClient *llm.ChatClient, articles []db.Article, threshold float64) []NewsGroup {
	if len(articles) == 0 {
		return nil
	}

	clusters := groupGreedy(articles, threshold)
	titles := nameClusters(ctx, chatClient, clusters)

	groups := make([]NewsGroup, len(clusters))
	for i, c := range clusters {
		groups[i] = NewsGroup{
			GroupTitle:   titles[i],
			Items:        c.Articles,
			SingleOutlet: isSingleOutlet(c.Articles),
			Category:     c.DomCate,
			Subcategory:  dominantSubcategory(c.Articles),
		}
	}
	return groups
}

func groupGreedy(articles []db.Article, threshold float64) []Cluster {
	var clusters []Cluster
	for _, a := range articles {
		if len(a.Embedding) == 0 {
			clusters = append(clusters, Cluster{Articles: []db.Article{a}, DomCate: a.Category})
			continue
		}

		bestIdx, bestSim := -1, float32(threshold)
		for i, c := range clusters {
			if len(c.Centroid) == 0 {
				continue
			}
			// Simple category gate
			if a.Category != "" && c.DomCate != "" && a.Category != c.DomCate {
				continue
			}

			sim := db.CosineSimilarity(a.Embedding, c.Centroid)
			if sim > bestSim {
				bestIdx, bestSim = i, sim
			}
		}

		if bestIdx >= 0 {
			c := &clusters[bestIdx]
			// Incremental centroid update: O(dim) instead of O(n*dim)
			oldN := float32(c.vecCount)
			newN := oldN + 1
			for j := range c.Centroid {
				c.Centroid[j] = (c.Centroid[j]*oldN + a.Embedding[j]) / newN
			}
			c.vecCount++
			c.Articles = append(c.Articles, a)
			c.DomCate = dominantCategory(c.Articles)
		} else {
			clusters = append(clusters, Cluster{
				Centroid: append([]float32(nil), a.Embedding...),
				Articles: []db.Article{a},
				DomCate:  a.Category,
				vecCount: 1,
			})
		}
	}
	return clusters
}

func nameClusters(ctx context.Context, chatClient *llm.ChatClient, clusters []Cluster) []string {
	titles := make([]string, len(clusters))
	var toName []int
	for i, c := range clusters {
		if len(c.Articles) <= 1 {
			titles[i] = fallbackTitle(c)
		} else {
			toName = append(toName, i)
		}
	}

	if len(toName) == 0 {
		return titles
	}

	// For simplicity, name in one chunk if small, or just fallback if too many
	// Here we implement a simple single-call naming for the compare handler (max 30 articles)
	var sb strings.Builder
	for _, idx := range toName {
		c := clusters[idx]
		fmt.Fprintf(&sb, "グループ%d: %s\n", idx, articlesToString(c.Articles))
	}

	const system = `各グループの「全記事」が共通して報じている出来事を、20字以内の自然な日本語で命名してください。
必ずJSON形式のみで回答してください。
出力フォーマット: { "groups": [{ "index": 0, "title": "タイトル" }, ...] }`

	resp, err := chatClient.Complete(ctx, system, sb.String())
	if err != nil {
		for _, idx := range toName {
			titles[idx] = fallbackTitle(clusters[idx])
		}
		return titles
	}

	var res struct {
		Groups []struct {
			Index int    `json:"index"`
			Title string `json:"title"`
		} `json:"groups"`
	}
	// Extract JSON in case of preamble
	start := strings.Index(resp, "{")
	end := strings.LastIndex(resp, "}")
	if start != -1 && end > start {
		resp = resp[start : end+1]
	}

	if err := json.Unmarshal([]byte(resp), &res); err != nil {
		for _, idx := range toName {
			titles[idx] = fallbackTitle(clusters[idx])
		}
		return titles
	}

	titleMap := make(map[int]string)
	for _, g := range res.Groups {
		titleMap[g.Index] = g.Title
	}
	for _, idx := range toName {
		if t, ok := titleMap[idx]; ok && t != "" {
			titles[idx] = t
		} else {
			titles[idx] = fallbackTitle(clusters[idx])
		}
	}

	return titles
}

func fallbackTitle(c Cluster) string {
	if len(c.Articles) > 0 {
		t := c.Articles[0].Title
		if len([]rune(t)) > 20 {
			return string([]rune(t)[:20])
		}
		return t
	}
	return "無題"
}

func articlesToString(arts []db.Article) string {
	var titles []string
	for _, a := range arts {
		titles = append(titles, "「"+a.Title+"」")
	}
	return strings.Join(titles, " ")
}

func isSingleOutlet(arts []db.Article) bool {
	if len(arts) <= 1 {
		return true
	}
	first := arts[0].Source
	for _, a := range arts[1:] {
		if a.Source != first {
			return false
		}
	}
	return true
}

func dominantCategory(arts []db.Article) string {
	counts := make(map[string]int)
	for _, a := range arts {
		counts[a.Category]++
	}
	best, max := "other", 0
	for c, n := range counts {
		if n > max {
			best, max = c, n
		}
	}
	return best
}

func dominantSubcategory(arts []db.Article) string {
	counts := make(map[string]int)
	for _, a := range arts {
		if a.Subcategory != "" {
			counts[a.Subcategory]++
		}
	}
	best, max := "", 0
	for s, n := range counts {
		if n > max {
			best, max = s, n
		}
	}
	return best
}

