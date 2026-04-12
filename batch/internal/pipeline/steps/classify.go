package steps

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"math"
	"strings"
	"sync"

	"github.com/newsprism/shared/db"
	"github.com/newsprism/shared/llm"
	"github.com/newsprism/shared/taxonomy"
)

// Phase A: embedding-based classification (fast, ~100ms/article)
// Phase B: LLM fallback for low-confidence articles
// Phase C: keyword fallback if LLM fails

// ── 参照 embedding キャッシュ ────────────────────────────────────────────────

type subRef struct {
	categoryID    string
	subcategoryID string
	vec           []float32
}

var (
	refOnce sync.Once
	refVecs []subRef
	refErr  error
)

func loadRefEmbeddings(ctx context.Context, embedClient *llm.EmbedClient) ([]subRef, error) {
	refOnce.Do(func() {
		subs := taxonomy.AllSubcategoryTexts()
		texts := make([]string, len(subs))
		for i, s := range subs {
			texts[i] = s.Text
		}
		// サブカテゴリ説明はドキュメント側（"文章: " プレフィックス）
		vecs, err := embedClient.EmbedBatchWithPrefix(ctx, texts, "文章: ")
		if err != nil {
			refErr = fmt.Errorf("reference embedding failed: %w", err)
			return
		}
		refs := make([]subRef, 0, len(subs))
		for i, s := range subs {
			if i < len(vecs) && vecs[i] != nil {
				refs = append(refs, subRef{
					categoryID:    s.CategoryID,
					subcategoryID: s.SubcategoryID,
					vec:           vecs[i],
				})
			}
		}
		refVecs = refs
	})
	return refVecs, refErr
}

// ── コサイン類似度 ────────────────────────────────────────────────────────────

func cosineSim(a, b []float32) float64 {
	if len(a) != len(b) || len(a) == 0 {
		return 0
	}
	var dot, normA, normB float64
	for i := range a {
		dot += float64(a[i]) * float64(b[i])
		normA += float64(a[i]) * float64(a[i])
		normB += float64(b[i]) * float64(b[i])
	}
	if normA == 0 || normB == 0 {
		return 0
	}
	return dot / (math.Sqrt(normA) * math.Sqrt(normB))
}

func pickBestRef(vec []float32, refs []subRef) (subRef, float64) {
	var best subRef
	bestSim := -1.0
	for _, r := range refs {
		s := cosineSim(vec, r.vec)
		if s > bestSim {
			bestSim = s
			best = r
		}
	}
	return best, bestSim
}

// ── LLM 分類 ─────────────────────────────────────────────────────────────────

var systemPrompt = fmt.Sprintf(`あなたはニュース分類の専門家です。
与えられたニュース記事を以下の分類基準に基づいて正確に分類してください。

%s

## ルール
- 必ずJSON形式のみで回答する（説明文不要）
- category と subcategory は英語IDを使用する
- confidence は 0.0〜1.0 で回答する`, taxonomy.BuildClassificationGuide())

type llmResult struct {
	Category    string  `json:"category"`
	Subcategory string  `json:"subcategory"`
	Confidence  float64 `json:"confidence"`
}

type llmBatchResult struct {
	Results []struct {
		Index       int     `json:"index"`
		Category    string  `json:"category"`
		Subcategory string  `json:"subcategory"`
		Confidence  float64 `json:"confidence"`
	} `json:"results"`
}

func classifyBatchLLM(ctx context.Context, chatClient *llm.ChatClient, articles []db.Article) []llmResult {
	validCats := taxonomy.ValidCategoryIDs()

	lines := make([]string, len(articles))
	for i, a := range articles {
		text := a.Title
		if a.Summary != "" {
			sum := a.Summary
			if len([]rune(sum)) > 80 {
				sum = string([]rune(sum)[:80])
			}
			text += " - " + sum
		}
		lines[i] = fmt.Sprintf("%d: 「%s」", i, text)
	}
	userMsg := fmt.Sprintf("以下の%d件の記事を分類してください。\n\n%s", len(articles), strings.Join(lines, "\n"))

	raw, err := chatClient.CompleteJSON(ctx, systemPrompt, userMsg)
	if err != nil {
		slog.Warn("classify LLM batch failed", "err", err)
		return nil
	}

	var batch llmBatchResult
	if jsonErr := json.Unmarshal([]byte(raw), &batch); jsonErr != nil {
		slog.Warn("classify LLM batch parse failed", "err", jsonErr, "raw", raw[:min(len(raw), 200)])
		return nil
	}

	resultMap := make(map[int]llmResult, len(batch.Results))
	for _, r := range batch.Results {
		cat := r.Category
		if !validCats[cat] {
			cat = classifyByKeyword(articles[r.Index].Title + " " + articles[r.Index].Summary)
		}
		sub := r.Subcategory
		if !taxonomy.ValidSubcategoryID(cat, sub) {
			sub = taxonomy.FirstSubcategoryID(cat)
		}
		resultMap[r.Index] = llmResult{Category: cat, Subcategory: sub, Confidence: r.Confidence}
	}

	results := make([]llmResult, len(articles))
	for i, a := range articles {
		if r, ok := resultMap[i]; ok {
			results[i] = r
		} else {
			// LLM がこのインデックスを返さなかった
			cat := classifyByKeyword(a.Title + " " + a.Summary)
			results[i] = llmResult{Category: cat, Subcategory: taxonomy.FirstSubcategoryID(cat)}
		}
	}
	return results
}

// ── キーワードフォールバック ──────────────────────────────────────────────────
// カテゴリ名は新 taxonomy（8カテゴリ）に統一

var categoryKeywords = map[string][]string{
	"politics": {
		"政府", "首相", "大臣", "国会", "議員", "与党", "野党", "自民党", "立憲", "公明党",
		"維新", "共産党", "選挙", "投票", "政策", "法案", "閣議", "内閣", "官房長官",
		"防衛", "外交", "安全保障", "地方自治", "知事", "市長", "県議会", "市議会",
	},
	"economy": {
		"経済", "GDP", "物価", "インフレ", "デフレ", "日銀", "金利", "財政", "予算",
		"株価", "円", "貿易", "賃金", "雇用", "失業", "景気", "為替", "不動産", "地価", "住宅",
		"日経平均", "ダウ", "市況", "株式", "相場", "TOPIX",
	},
	"business": {
		"企業", "業績", "売上", "M&A", "上場", "倒産", "リストラ", "決算", "純利益",
		"株式", "経営", "投資", "スタートアップ", "IPO", "自動車", "製造業", "メーカー", "小売", "サービス",
	},
	"international": {
		"国際", "海外", "米国", "アメリカ", "中国", "韓国", "台湾", "ロシア", "ウクライナ", "中東",
		"ヨーロッパ", "EU", "国連", "NATO", "首脳会談", "制裁", "条約", "G7", "大統領選",
		"ブラジル", "メキシコ", "アルゼンチン",
	},
	"society": {
		"事件", "犯罪", "逮捕", "容疑者", "警察", "詐欺", "殺人", "強盗", "書類送検",
		"事故", "交通事故", "脱線", "火災", "裁判", "訴訟", "判決", "社会問題", "少子化", "高齢化", "ジェンダー", "地域",
		"天皇", "皇后", "皇室", "皇太子",
	},
	"health": {
		"医療", "病院", "感染", "ウイルス", "ワクチン", "薬", "治療", "健康",
		"介護", "医師", "看護", "公衆衛生", "厚生労働", "メンタル", "ストレス", "精神科",
	},
	"disaster": {
		"地震", "津波", "台風", "豪雨", "大雪", "暴風", "原発", "避難",
		"災害", "警報", "震度", "マグニチュード", "土砂災害",
	},
	"sports": {
		"野球", "サッカー", "オリンピック", "パラリンピック", "Jリーグ", "NPB", "MLB", "メジャーリーグ", "大谷翔平",
		"テニス", "バスケ", "相撲", "格闘技", "競技", "選手", "試合", "優勝", "監督",
	},
	"science_tech": {
		"技術", "AI", "宇宙", "研究", "開発", "特許", "データ", "デジタル", "IT", "スマホ", "アプリ",
		"半導体", "量子", "ロボット", "自動運転", "環境", "気候", "温暖化",
		"再生可能", "エネルギー", "脱炭素", "カーボン", "サイバー", "バイオ", "遺伝子",
		"生物多様性", "公害",
	},
	"weather": {
		"天気", "気象", "気温", "夏日", "真夏日", "猛暑日", "酷暑", "熱中症", "雨", "大雨", "豪雨", "雪", "大雪", "積雪", "寒波",
		"降水", "梅雨", "初雪", "紅葉", "桜", "開花",
	},
	"culture_lifestyle": {
		"文化", "映画", "音楽", "芸術", "観光", "食", "グルメ", "スイーツ", "旅行", "ホテル",
		"エンタメ", "芸能", "アイドル", "アニメ", "漫画", "ゲーム", "教育", "学校", "受験", "展覧会", "美術館",
	},
}

func classifyByKeyword(text string) string {
	best, bestScore := "society", 0 // デフォルトは society（最も汎用的なカテゴリ）
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

// ── メインの Classify ─────────────────────────────────────────────────────────

// Classify assigns category/subcategory to unclassified articles using:
// 1. Embedding cosine similarity classification (fast)
// 2. LLM fallback for low-confidence results
// 3. Keyword fallback if LLM fails
func Classify(ctx context.Context, pool *db.Pool, embedClient *llm.EmbedClient, chatClient *llm.ChatClient, threshold float64) error {
	articles, err := db.GetUnclassifiedArticles(ctx, pool)
	if err != nil {
		return err
	}
	if len(articles) == 0 {
		slog.Info("classify: no articles to classify")
		return nil
	}

	refs, err := loadRefEmbeddings(ctx, embedClient)
	if err != nil {
		slog.Warn("classify: reference embedding unavailable, falling back to keywords", "err", err)
		refs = nil
	}

	type classifyResult struct {
		url         string
		category    string
		subcategory string
	}

	results := make([]classifyResult, len(articles))
	var llmBatch []int // インデックス: embedding 信頼度不足で LLM に回すもの

	// Phase A: embedding 分類
	if len(refs) > 0 {
		texts := make([]string, len(articles))
		for i, a := range articles {
			text := a.Title
			if a.Summary != "" {
				text += "\n" + a.Summary
			}
			texts[i] = text
		}
		// 記事はクエリ側（"クエリ: " プレフィックス）
		vecs, embedErr := embedClient.EmbedBatchWithPrefix(ctx, texts, "クエリ: ")
		if embedErr != nil {
			slog.Warn("classify: article embedding failed, falling back to keywords", "err", embedErr)
			vecs = nil
		}

		for i, a := range articles {
			var vec []float32
			if vecs != nil && i < len(vecs) {
				vec = vecs[i]
			}
			if vec == nil {
				cat := classifyByKeyword(a.Title + " " + a.Summary)
				results[i] = classifyResult{url: a.URL, category: cat, subcategory: taxonomy.FirstSubcategoryID(cat)}
				continue
			}
			best, sim := pickBestRef(vec, refs)
			if sim >= threshold {
				results[i] = classifyResult{url: a.URL, category: best.categoryID, subcategory: best.subcategoryID}
			} else {
				llmBatch = append(llmBatch, i)
			}
		}
	} else {
		// 参照 embedding なし → 全件キーワード
		for i, a := range articles {
			cat := classifyByKeyword(a.Title + " " + a.Summary)
			results[i] = classifyResult{url: a.URL, category: cat, subcategory: taxonomy.FirstSubcategoryID(cat)}
		}
	}

	// Phase B: LLM フォールバック
	if len(llmBatch) > 0 && chatClient != nil {
		batchArticles := make([]db.Article, len(llmBatch))
		for j, idx := range llmBatch {
			batchArticles[j] = articles[idx]
		}
		llmResults := classifyBatchLLM(ctx, chatClient, batchArticles)

		for j, idx := range llmBatch {
			if llmResults != nil && j < len(llmResults) {
				r := llmResults[j]
				results[idx] = classifyResult{url: articles[idx].URL, category: r.Category, subcategory: r.Subcategory}
			} else {
				// Phase C: キーワードフォールバック
				cat := classifyByKeyword(articles[idx].Title + " " + articles[idx].Summary)
				results[idx] = classifyResult{url: articles[idx].URL, category: cat, subcategory: taxonomy.FirstSubcategoryID(cat)}
			}
		}
	} else if len(llmBatch) > 0 {
		for _, idx := range llmBatch {
			cat := classifyByKeyword(articles[idx].Title + " " + articles[idx].Summary)
			results[idx] = classifyResult{url: articles[idx].URL, category: cat, subcategory: taxonomy.FirstSubcategoryID(cat)}
		}
	}

	entries := make([]struct{ URL, Category, Subcategory string }, len(results))
	for i, r := range results {
		entries[i] = struct{ URL, Category, Subcategory string }{
			URL:         r.url,
			Category:    r.category,
			Subcategory: r.subcategory,
		}
	}

	if err := db.SaveClassifications(ctx, pool, entries); err != nil {
		return err
	}
	slog.Info("classify done",
		"total", len(articles),
		"embedding", len(articles)-len(llmBatch),
		"llm", len(llmBatch),
	)
	return nil
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
