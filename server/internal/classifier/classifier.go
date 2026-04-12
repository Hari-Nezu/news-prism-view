package classifier

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/newsprism/shared/llm"
	"github.com/newsprism/shared/taxonomy"
)

type ClassificationResult struct {
	Category    string  `json:"category"`
	Subcategory string  `json:"subcategory"`
	Confidence  float64 `json:"confidence"`
}

var SystemPrompt = fmt.Sprintf(`あなたはニュース分類の専門家です。
与えられたニュース記事を以下の分類基準に基づいて正確に分類してください。

%s

## ルール
- 必ずJSON形式のみで回答する（説明文不要）
- category と subcategory は英語IDを使用する
- confidence は 0.0〜1.0 で回答する`, taxonomy.BuildClassificationGuide())

func Classify(ctx context.Context, client *llm.ChatClient, title, summary string) (*ClassificationResult, error) {
	content := fmt.Sprintf("タイトル: %s\n要約: %s", title, truncate(summary, 300))
	userPrompt := fmt.Sprintf("以下の記事を分類してください。\n\n%s", content)

	resp, err := client.CompleteJSON(ctx, SystemPrompt, userPrompt)
	if err != nil {
		return nil, err
	}

	var raw struct {
		Category    string  `json:"category"`
		Subcategory string  `json:"subcategory"`
		Confidence  float64 `json:"confidence"`
	}

	if err := json.Unmarshal([]byte(resp), &raw); err != nil {
		return nil, fmt.Errorf("parse classification response: %w (resp: %s)", err, resp)
	}

	// Validate and fallback
	category := raw.Category
	if !taxonomy.ValidCategoryIDs()[category] {
		category = "other" // Or some fallback logic
	}

	subcategory := raw.Subcategory
	if !taxonomy.ValidSubcategoryID(category, subcategory) {
		subcategory = taxonomy.FirstSubcategoryID(category)
		if subcategory == "" {
			subcategory = "other"
		}
	}

	return &ClassificationResult{
		Category:    category,
		Subcategory: subcategory,
		Confidence:  raw.Confidence,
	}, nil
}

func truncate(s string, max int) string {
	r := []rune(s)
	if len(r) <= max {
		return s
	}
	return string(r[:max])
}
