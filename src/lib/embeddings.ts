import { LLM_BASE_URL, EMBED_MODEL } from "@/lib/config";

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return normA === 0 || normB === 0 ? 0 : dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** ruri-v3 のプレフィックスルール */
export const RURI_PREFIX = {
  /** 検索対象ドキュメント（記事・グループ） */
  DOC:   "文章: ",
  /** 検索クエリ（分類時の記事テキスト） */
  QUERY: "クエリ: ",
} as const;

/**
 * llama.cpp の埋め込みAPIでテキストをベクトル化する
 * エラー時は null を返す（埋め込みなしでも記事保存は継続する）
 */
export async function embed(text: string, prefix: string = RURI_PREFIX.DOC): Promise<number[] | null> {
  try {
    const res = await fetch(`${LLM_BASE_URL}/v1/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: EMBED_MODEL,
        input: `${prefix}${text}`.slice(0, 2000),
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[embed] HTTP ${res.status}:`, body.slice(0, 200));
      return null;
    }

    const data = await res.json();
    const vec: number[] = data.data?.[0]?.embedding ?? null;
    if (!vec) console.error("[embed] unexpected response shape:", JSON.stringify(data).slice(0, 200));
    return vec ?? null;
  } catch (e) {
    console.error("[embed] fetch error:", e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * 複数テキストを一括ベクトル化
 * 失敗した要素は null になる
 */
export async function embedBatch(texts: string[], prefix: string = RURI_PREFIX.DOC): Promise<(number[] | null)[]> {
  if (texts.length === 0) return [];
  try {
    const res = await fetch(`${LLM_BASE_URL}/v1/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: EMBED_MODEL,
        input: texts.map((t) => `${prefix}${t}`.slice(0, 2000)),
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[embedBatch] HTTP ${res.status}:`, body.slice(0, 300));
      return texts.map(() => null);
    }
    const data = await res.json();
    const items: { index: number; embedding: number[] }[] = data.data ?? [];
    if (items.length === 0) console.error("[embedBatch] unexpected response shape:", JSON.stringify(data).slice(0, 300));
    const sorted = [...items].sort((a, b) => a.index - b.index);
    const embeddings: (number[] | null)[] = sorted.map((d) => d.embedding ?? null);
    while (embeddings.length < texts.length) embeddings.push(null);
    return embeddings;
  } catch (e) {
    console.error("[embedBatch] fetch error:", e instanceof Error ? e.message : e);
    return texts.map(() => null);
  }
}

/** タイトル + サマリーを結合してベクトル化（記事検索用） */
export async function embedArticle(
  title: string,
  summary: string
): Promise<number[] | null> {
  return embed(`${title}\n${summary}`);
}

/**
 * NewsGroup をベクトル化（グループタイトル + 記事タイトル群 + 参加媒体名）
 * グループ横断の類似イベント検索に使用する
 */
export async function embedNewsGroup(group: {
  groupTitle: string;
  items: { title: string; source: string }[];
}): Promise<number[] | null> {
  const sources = [...new Set(group.items.map((i) => i.source).filter(Boolean))];
  const titles  = group.items.map((i) => i.title).join("\n");
  const text    = [group.groupTitle, sources.join(" "), titles].join("\n");
  return embed(text);
}
