import { incrementalGroupArticles } from "@/lib/news-grouper";
import type { RssFeedItem } from "@/types";

export async function POST(request: Request) {
  try {
    const { items }: { items: RssFeedItem[] } = await request.json();
    if (!Array.isArray(items) || items.length === 0) {
      return Response.json({ groups: [] });
    }
    const groups = await incrementalGroupArticles(items);
    return Response.json({ groups });
  } catch (error) {
    const message = error instanceof Error ? error.message : "グループ化に失敗しました";
    console.error("[rss/group] エラー:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
