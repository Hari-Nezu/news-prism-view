import { z } from "zod";
import type { AnalysisResult } from "@/types";
import { OLLAMA_BASE_URL, OLLAMA_MODEL, MULTI_MODELS as DEFAULT_MULTI_MODELS } from "@/lib/config";

const AnalysisSchema = z.object({
  economic: z.number().min(-1).max(1),
  social: z.number().min(-1).max(1),
  diplomatic: z.number().min(-1).max(1),
  emotional_tone: z.number().min(-1).max(1),
  bias_warning: z.boolean(),
  summary: z.string(),
  counter_opinion: z.string(),
  confidence: z.number().min(0).max(1),
});

const SYSTEM_PROMPT = `あなたは政治・社会・外交のポジショニング分析の専門家です。
与えられたニュース記事を以下の3軸で評価し、必ずJSON形式のみで回答してください。

## 評価軸（各-1.0〜+1.0）

**経済軸 (economic)**
- -1.0: 市場原理、小さな政府、減税、規制緩和、自由競争
- 0.0: 中立
- +1.0: 再分配、大きな政府、社会保障の充実、格差是正

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

bias_warningは emotional_tone が 0.6 以上または -0.6 以下の場合に true にしてください。`;

export const MULTI_MODELS = DEFAULT_MULTI_MODELS;

/** モデルの表示ラベル・色 */
export const MODEL_META: Record<string, { label: string; color: string }> = {
  "gemma3:12b":  { label: "Gemma 3",   color: "#ef4444" },  // 赤
  "qwen3.5:4b":  { label: "Qwen 3.5",  color: "#22c55e" },  // 緑
  "llama3.2":    { label: "Llama 3.2",  color: "#a855f7" },  // 紫
};

export async function analyzeArticle(
  title: string,
  content: string,
  model?: string
): Promise<AnalysisResult> {
  const userPrompt = `以下のニュース記事を分析してください。

タイトル: ${title}

本文:
${content.slice(0, 3000)}`;

  const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: model ?? OLLAMA_MODEL,
      system: SYSTEM_PROMPT,
      prompt: userPrompt,
      stream: false,
      format: "json",
      options: {
        temperature: 0.1,
        top_p: 0.9,
        num_predict: 1024,
      },
      think: false,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ollama APIエラー: ${response.status} ${text}`);
  }

  const data = await response.json();
  const raw = JSON.parse(data.response);
  const parsed = AnalysisSchema.parse(raw);

  return {
    scores: {
      economic: parsed.economic,
      social: parsed.social,
      diplomatic: parsed.diplomatic,
    },
    emotionalTone: parsed.emotional_tone,
    biasWarning: parsed.bias_warning,
    summary: parsed.summary,
    counterOpinion: parsed.counter_opinion,
    confidence: parsed.confidence,
  };
}

/**
 * 複数モデルで順次分析し、1モデルずつ結果をyieldする
 */
export async function* analyzeArticleMultiModel(
  title: string,
  content: string,
  models: string[] = MULTI_MODELS
): AsyncGenerator<{ model: string; result: AnalysisResult; index: number; total: number }> {
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    try {
      const result = await analyzeArticle(title, content, model);
      yield { model, result, index: i, total: models.length };
    } catch (err) {
      console.error(`[multiModel] ${model} 分析失敗:`, err);
      // モデルが使えない場合はスキップ
    }
  }
}

export async function checkOllamaHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
