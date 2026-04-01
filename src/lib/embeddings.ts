import { OLLAMA_BASE_URL, EMBED_MODEL } from "@/lib/config";

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return normA === 0 || normB === 0 ? 0 : dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Ollama の埋め込みAPIでテキストをベクトル化する
 * エラー時は null を返す（埋め込みなしでも記事保存は継続する）
 */
export async function embed(text: string): Promise<number[] | null> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: EMBED_MODEL,
        input: text.slice(0, 2000), // トークン上限に合わせて切り詰め
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return null;

    const data = await res.json();
    // Ollama の embed API は { embeddings: [[...]] } を返す
    const vec: number[] = data.embeddings?.[0] ?? data.embedding ?? null;
    return vec ?? null;
  } catch {
    return null;
  }
}

/**
 * 複数テキストを一括ベクトル化（1回のOllama呼び出し）
 * 失敗した要素は null になる
 */
export async function embedBatch(texts: string[]): Promise<(number[] | null)[]> {
  if (texts.length === 0) return [];
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: EMBED_MODEL,
        input: texts.map((t) => t.slice(0, 2000)),
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return texts.map(() => null);
    const data = await res.json();
    const embeddings: (number[] | null)[] = data.embeddings ?? [];
    while (embeddings.length < texts.length) embeddings.push(null);
    return embeddings;
  } catch {
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
