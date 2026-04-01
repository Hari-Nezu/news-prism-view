/**
 * LLMベースのニュース分類器（Phase 1）
 * - 単一記事: classifyArticleLLM()
 * - 一括分類: classifyArticlesBatchLLM()（RSS取得時の効率化）
 * - Ollama 障害時はキーワード分類にフォールバック
 */

import { z } from "zod";
import { classifyTopic, type TopicId } from "./topic-classifier";
import { buildClassificationGuide, CATEGORIES } from "./news-taxonomy-configs";

import { OLLAMA_BASE_URL, CLASSIFY_MODEL } from "@/lib/config";

export interface ClassificationResult {
  category:    TopicId;
  subcategory: string;
  confidence:  number;
}

const VALID_CATEGORY_IDS = new Set(CATEGORIES.map((c) => c.id));

const SingleSchema = z.object({
  category:    z.string(),
  subcategory: z.string(),
  confidence:  z.number().min(0).max(1).default(0.8),
});

const BatchSchema = z.object({
  results: z.array(
    z.object({
      index:       z.number().int(),
      category:    z.string(),
      subcategory: z.string(),
      confidence:  z.number().min(0).max(1).default(0.8),
    })
  ),
});

const SYSTEM_PROMPT = `あなたはニュース分類の専門家です。
与えられたニュース記事を以下の分類基準に基づいて正確に分類してください。

${buildClassificationGuide()}

## ルール
- 必ずJSON形式のみで回答する（説明文不要）
- category と subcategory は英語IDを使用する
- confidence は 0.0〜1.0 で回答する`;

function fallback(title: string, summary?: string): ClassificationResult {
  const category = classifyTopic(title, summary);
  const cat = CATEGORIES.find((c) => c.id === category);
  return { category, subcategory: cat?.subcategories[0]?.id ?? "other", confidence: 0 };
}

function resolveCategory(raw: string, title: string, summary?: string): TopicId {
  return VALID_CATEGORY_IDS.has(raw) ? (raw as TopicId) : classifyTopic(title, summary);
}

function resolveSubcategory(categoryId: string, rawSub: string): string {
  const cat = CATEGORIES.find((c) => c.id === categoryId);
  return cat?.subcategories.some((s) => s.id === rawSub)
    ? rawSub
    : (cat?.subcategories[0]?.id ?? "other");
}

/** 単一記事をLLMで分類する */
export async function classifyArticleLLM(
  title:    string,
  summary?: string,
): Promise<ClassificationResult> {
  const content = summary
    ? `タイトル: ${title}\n要約: ${summary.slice(0, 300)}`
    : `タイトル: ${title}`;

  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model:   CLASSIFY_MODEL,
        system:  SYSTEM_PROMPT,
        prompt:  `以下の記事を分類してください。\n\n${content}`,
        stream:  false,
        format:  "json",
        options: { temperature: 0.1 },
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) throw new Error(`Ollama ${res.status}`);

    const data   = await res.json();
    const parsed = SingleSchema.parse(JSON.parse(data.response));
    const category    = resolveCategory(parsed.category, title, summary);
    const subcategory = resolveSubcategory(category, parsed.subcategory);

    return { category, subcategory, confidence: parsed.confidence };
  } catch {
    return fallback(title, summary);
  }
}

/** 複数記事を一括でLLMで分類する（RSS取得時の効率化） */
export async function classifyArticlesBatchLLM(
  items: { title: string; summary?: string }[],
): Promise<ClassificationResult[]> {
  if (items.length === 0) return [];

  const articleList = items
    .map((item, i) =>
      `${i}: 「${item.title}」${item.summary ? ` - ${item.summary.slice(0, 80)}` : ""}`
    )
    .join("\n");

  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model:   CLASSIFY_MODEL,
        system:  SYSTEM_PROMPT,
        prompt:  `以下の${items.length}件の記事を分類してください。\n\n${articleList}`,
        stream:  false,
        format:  "json",
        options: { temperature: 0.1 },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) throw new Error(`Ollama ${res.status}`);

    const data   = await res.json();
    const parsed = BatchSchema.parse(JSON.parse(data.response));
    const resultMap = new Map(parsed.results.map((r) => [r.index, r]));

    return items.map((item, i) => {
      const r = resultMap.get(i);
      if (!r) return fallback(item.title, item.summary);

      const category    = resolveCategory(r.category, item.title, item.summary);
      const subcategory = resolveSubcategory(category, r.subcategory);
      return { category, subcategory, confidence: r.confidence };
    });
  } catch {
    return items.map((item) => fallback(item.title, item.summary));
  }
}
