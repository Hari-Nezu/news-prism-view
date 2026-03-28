const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
const EMBED_MODEL = process.env.EMBED_MODEL ?? "nomic-embed-text";

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
