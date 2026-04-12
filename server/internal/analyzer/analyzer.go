package analyzer

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/newsprism/shared/llm"
)

type Scores struct {
	Economic   float64 `json:"economic"`
	Social     float64 `json:"social"`
	Diplomatic float64 `json:"diplomatic"`
}

type AnalysisResult struct {
	Scores         Scores  `json:"scores"`
	EmotionalTone  float64 `json:"emotionalTone"`
	BiasWarning    bool    `json:"biasWarning"`
	Summary        string  `json:"summary"`
	CounterOpinion string  `json:"counterOpinion"`
	Confidence     float64 `json:"confidence"`
}

const SystemPrompt = `あなたは政治・社会・外交のポジショニング分析の専門家です。
与えられたニュース記事を以下の3軸で評価し、必ずJSON形式のみで回答してください。

## 評価軸（各-1.0〜+1.0）

**経済軸 (economic)**
- -1.0: 市場原理、小さな政府、減税、規制緩和、自由競争
- 0.0: 中立
- +1.0: 再分配、大きな政府、社会保障の充実、格差変正

**社会軸 (social)**
- -1.0: 伝統・秩序・家族重視、保守的価値観、変化に慎重
- 0.0: 中立
- +1.0: 多様性・個人の自由・変化志向、進歩的価値観

**外交安保軸 (diplomatic)**
- -1.0: 抑止力重視・現実主義・タカ派（軍事力・同盟強化）
- 0.0: 中立
- +1.0: 対話・平和主義・ハト派（外交解決・軍縮）

**感情トーン (emotional_tone)**
- -1.0: 恐怖・怒り・不安を煽る
- 0.0: 中立・客観的
- +1.0: 希望・建設的・ポジティブ

## 出力フォーマット（JSONのみ、説明文不要）
{
  "economic": 数値,
  "social": 数値,
  "diplomatic": 数値,
  "emotional_tone": 数値,
  "bias_warning": true/false,
  "summary": "記事の要約（100字以内）",
  "counter_opinion": "反対の立場からの反論（150字以内）",
  "confidence": 数値
}

bias_warningは emotional_tone が 0.6 以上または -0.6 以下の場合に true にしてください。`

func Analyze(ctx context.Context, client *llm.ChatClient, title, content string) (*AnalysisResult, error) {
	userPrompt := fmt.Sprintf("以下のニュース記事を分析してください。\n\nタイトル: %s\n\n本文:\n%s", title, truncate(content, 3000))

	resp, err := client.CompleteJSON(ctx, SystemPrompt, userPrompt)
	if err != nil {
		return nil, err
	}

	var raw struct {
		Economic       float64 `json:"economic"`
		Social         float64 `json:"social"`
		Diplomatic     float64 `json:"diplomatic"`
		EmotionalTone  float64 `json:"emotional_tone"`
		BiasWarning    bool    `json:"bias_warning"`
		Summary        string  `json:"summary"`
		CounterOpinion string  `json:"counter_opinion"`
		Confidence     float64 `json:"confidence"`
	}

	if err := json.Unmarshal([]byte(resp), &raw); err != nil {
		return nil, fmt.Errorf("parse analysis response: %w (resp: %s)", err, resp)
	}

	return &AnalysisResult{
		Scores: Scores{
			Economic:   raw.Economic,
			Social:     raw.Social,
			Diplomatic: raw.Diplomatic,
		},
		EmotionalTone:  raw.EmotionalTone,
		BiasWarning:    raw.BiasWarning,
		Summary:        raw.Summary,
		CounterOpinion: raw.CounterOpinion,
		Confidence:     raw.Confidence,
	}, nil
}

func truncate(s string, max int) string {
	r := []rune(s)
	if len(r) <= max {
		return s
	}
	return string(r[:max])
}
