package steps

import (
	"context"
	"log/slog"
	"strings"

	"github.com/newsprism/batch/internal/db"
)

// Phase A: keyword-based classification (no LLM required).
// Phase B: replace with embedding → LLM cascade.

var categoryKeywords = map[string][]string{
	"politics": {
		"政府", "首相", "大臣", "国会", "議員", "与党", "野党", "自民党", "立憲", "公明党",
		"維新", "共産党", "選挙", "投票", "政策", "法案", "閣議", "内閣", "官房長官",
	},
	"economy": {
		"経済", "GDP", "物価", "インフレ", "日銀", "金利", "財政", "予算",
		"株価", "円", "貿易", "賃金", "雇用", "失業", "景気",
	},
	"international": {
		"外交", "防衛", "外務省", "中国", "ロシア", "アメリカ", "米国", "NATO",
		"国連", "ウクライナ", "台湾", "韓国", "北朝鮮", "G7", "G20", "制裁",
	},
	"society": {
		"社会", "教育", "医療", "福祉", "少子化", "人口", "犯罪", "事件",
		"事故", "災害", "地域", "生活", "住宅",
	},
	"science_tech": {
		"技術", "AI", "宇宙", "研究", "開発", "特許", "データ", "デジタル",
		"半導体", "量子", "ロボット", "自動運転",
	},
	"environment": {
		"環境", "気候", "温暖化", "CO2", "再生可能", "エネルギー", "原発", "脱炭素",
		"カーボン", "排出",
	},
	"business": {
		"企業", "業績", "売上", "M&A", "上場", "倒産", "リストラ", "決算",
		"株式", "経営", "投資",
	},
	"culture": {
		"文化", "スポーツ", "映画", "音楽", "芸術", "観光", "食", "エンタメ",
	},
}

// Classify assigns category/subcategory to unclassified articles using keyword matching.
func Classify(ctx context.Context, pool *db.Pool) error {
	articles, err := db.GetUnclassifiedArticles(ctx, pool)
	if err != nil {
		return err
	}
	if len(articles) == 0 {
		slog.Info("classify: no articles to classify")
		return nil
	}

	entries := make([]struct{ URL, Category, Subcategory string }, 0, len(articles))
	for _, a := range articles {
		category := classifyByKeyword(a.Title + " " + a.Summary)
		entries = append(entries, struct{ URL, Category, Subcategory string }{
			URL: a.URL, Category: category, Subcategory: "",
		})
	}

	if err := db.SaveClassifications(ctx, pool, entries); err != nil {
		return err
	}
	slog.Info("classify done", "classified", len(entries))
	return nil
}

func classifyByKeyword(text string) string {
	best, bestScore := "other", 0
	for cat, keywords := range categoryKeywords {
		score := 0
		for _, kw := range keywords {
			if strings.Contains(text, kw) {
				score++
			}
		}
		if score > bestScore {
			best, bestScore = cat, score
		}
	}
	return best
}
