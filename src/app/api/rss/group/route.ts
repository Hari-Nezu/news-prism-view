export const maxDuration = 300; // 5分

import { incrementalGroupArticles } from "@/lib/news-grouper";
import { getRssArticlesSince, deleteStaleRssArticles } from "@/lib/db";
import type { RssFeedItem } from "@/types";

const WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const { items }: { items: RssFeedItem[] } = await request.json();

    // DBから過去3日分を取得し、フレッシュアイテムとマージ（URL重複排除）
    const since = new Date(Date.now() - WINDOW_MS);
    const dbItems = await getRssArticlesSince(since).catch(() => [] as RssFeedItem[]);

    const seen = new Set<string>();
    const merged: RssFeedItem[] = [];
    for (const item of [...(items ?? []), ...dbItems]) {
      if (!item.url || seen.has(item.url)) continue;
      seen.add(item.url);
      merged.push(item);
    }

    if (merged.length === 0) return Response.json({ groups: [] });

    // 古い記事を非同期で削除
    void deleteStaleRssArticles().catch(() => {});

    const groups = await incrementalGroupArticles(merged);
    return Response.json({ groups });
  } catch (error) {
    const message = error instanceof Error ? error.message : "グループ化に失敗しました";
    console.error("[rss/group] エラー:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
