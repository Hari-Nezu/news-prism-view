/**
 * ニュース分類器（Phase A: Embedding → LLM カスケード）
 * - Step 1: ruri-v3-310m によるコサイン類似度分類（~100ms/記事）
 * - Step 2: similarity < EMBED_THRESHOLD のみ LLM にフォールバック
 * - Ollama 障害時はキーワード分類にフォールバック
 */

import { z } from "zod";
import { classifyTopic, type TopicId } from "./topic-classifier";
import { buildClassificationGuide, CATEGORIES } from "./config/news-taxonomy-configs";
import { embed, embedBatch, cosineSimilarity, RURI_PREFIX } from "./embeddings";
import { LLM_BASE_URL, CLASSIFY_MODEL, EMBED_CLASSIFY_THRESHOLD } from "@/lib/config";

export interface ClassificationResult {
  category:    TopicId;
  subcategory: string;
  confidence:  number;
}

const VALID_CATEGORY_IDS = new Set(CATEGORIES.map((c) => c.id));

/** embedding分類でconfidenceがこれ未満ならLLMにエスカレーション */
const EMBED_THRESHOLD = EMBED_CLASSIFY_THRESHOLD;

// ─── 参照embedding（サブカテゴリごと、起動時1回生成） ───────────────────────

type SubcategoryRef = { categoryId: string; subcategoryId: string; vec: number[] };

let _refEmbeddingsPromise: Promise<SubcategoryRef[]> | null = null;

function getReferenceEmbeddings(): Promise<SubcategoryRef[]> {
  if (!_refEmbeddingsPromise) {
    _refEmbeddingsPromise = initReferenceEmbeddings();
  }
  return _refEmbeddingsPromise;
}

async function initReferenceEmbeddings(): Promise<SubcategoryRef[]> {
  const entries = CATEGORIES.flatMap((cat) =>
    cat.subcategories.map((sub) => ({
      categoryId:    cat.id,
      subcategoryId: sub.id,
      text: `${cat.label} ${sub.label}: ${sub.description}`,
    }))
  );

  // カテゴリ説明はドキュメント側
  const vecs = await embedBatch(entries.map((e) => e.text), RURI_PREFIX.DOC);
  return entries.flatMap((e, i) =>
    vecs[i] ? [{ categoryId: e.categoryId, subcategoryId: e.subcategoryId, vec: vecs[i]! }] : []
  );
}

// ─── embedding分類 ──────────────────────────────────────────────────────────

/** テキストベクトルと参照embeddingのコサイン類似度でTop-1分類 */
function pickBestRef(vec: number[], refs: SubcategoryRef[]): { ref: SubcategoryRef; sim: number } | null {
  let best: SubcategoryRef | null = null;
  let bestSim = -Infinity;
  for (const ref of refs) {
    const sim = cosineSimilarity(vec, ref.vec);
    if (sim > bestSim) { bestSim = sim; best = ref; }
  }
  return best ? { ref: best, sim: bestSim } : null;
}

async function classifyByEmbedding(
  title: string,
  summary?: string,
): Promise<ClassificationResult | null> {
  const refs = await getReferenceEmbeddings();
  if (refs.length === 0) return null;

  // 分類時の記事はクエリ側
  const text = summary ? `${title}\n${summary.slice(0, 300)}` : title;
  const vec  = await embed(text, RURI_PREFIX.QUERY);
  if (!vec) return null;

  const result = pickBestRef(vec, refs);
  if (!result || result.sim < EMBED_THRESHOLD) return null;

  return {
    category:    result.ref.categoryId as TopicId,
    subcategory: result.ref.subcategoryId,
    confidence:  result.sim,
  };
}

// ─── LLM分類（内部ヘルパー） ────────────────────────────────────────────────

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

async function classifyWithLLM(title: string, summary?: string): Promise<ClassificationResult> {
  const content = summary
    ? `タイトル: ${title}\n要約: ${summary.slice(0, 300)}`
    : `タイトル: ${title}`;

  try {
    const res = await fetch(`${LLM_BASE_URL}/v1/chat/completions`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model:   CLASSIFY_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user",   content: `以下の記事を分類してください。\n\n${content}` },
        ],
        stream:          false,
        response_format: { type: "json_object" },
        temperature:     0.1,
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) throw new Error(`llama.cpp ${res.status}`);

    const data        = await res.json();
    const parsed      = SingleSchema.parse(JSON.parse(data.choices[0].message.content));
    const category    = resolveCategory(parsed.category, title, summary);
    const subcategory = resolveSubcategory(category, parsed.subcategory);
    return { category, subcategory, confidence: parsed.confidence };
  } catch {
    return fallback(title, summary);
  }
}

async function classifyBatchWithLLM(
  items: { title: string; summary?: string }[],
): Promise<ClassificationResult[]> {
  if (items.length === 0) return [];

  const articleList = items
    .map((item, i) =>
      `${i}: 「${item.title}」${item.summary ? ` - ${item.summary.slice(0, 80)}` : ""}`
    )
    .join("\n");

  try {
    const res = await fetch(`${LLM_BASE_URL}/v1/chat/completions`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model:   CLASSIFY_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user",   content: `以下の${items.length}件の記事を分類してください。\n\n${articleList}` },
        ],
        stream:          false,
        response_format: { type: "json_object" },
        temperature:     0.1,
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) throw new Error(`llama.cpp ${res.status}`);

    const data      = await res.json();
    const parsed    = BatchSchema.parse(JSON.parse(data.choices[0].message.content));
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

// ─── 公開API ───────────────────────────────────────────────────────────────

/** 単一記事を分類する（embedding → LLM カスケード） */
export async function classifyArticleLLM(
  title:    string,
  summary?: string,
): Promise<ClassificationResult> {
  const embResult = await classifyByEmbedding(title, summary);
  if (embResult) return embResult;
  return classifyWithLLM(title, summary);
}

/** 複数記事を一括分類する（embedding batch → 閾値未満のみ LLM） */
export async function classifyArticlesBatchLLM(
  items: { title: string; summary?: string }[],
): Promise<ClassificationResult[]> {
  if (items.length === 0) return [];

  const refs = await getReferenceEmbeddings();
  const texts = items.map((item) =>
    item.summary ? `${item.title}\n${item.summary.slice(0, 300)}` : item.title
  );

  // 分類時の記事はクエリ側
  const vecs = refs.length > 0 ? await embedBatch(texts, RURI_PREFIX.QUERY) : items.map(() => null);

  const results: (ClassificationResult | null)[] = vecs.map((vec) => {
    if (!vec || refs.length === 0) return null;
    const result = pickBestRef(vec, refs);
    if (!result || result.sim < EMBED_THRESHOLD) return null;
    return {
      category:    result.ref.categoryId as TopicId,
      subcategory: result.ref.subcategoryId,
      confidence:  result.sim,
    };
  });

  // confidence不足 or embedding失敗 → LLMにエスカレーション
  const llmIndices = results.flatMap((r, i) => (r === null ? [i] : []));

  if (llmIndices.length > 0) {
    const llmResults = await classifyBatchWithLLM(llmIndices.map((i) => items[i]));
    for (let j = 0; j < llmIndices.length; j++) {
      results[llmIndices[j]] = llmResults[j];
    }
  }

  return results.map((r, i) => r ?? fallback(items[i].title, items[i].summary));
}
