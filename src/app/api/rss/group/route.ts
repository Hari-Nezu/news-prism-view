export const maxDuration = 300; // 5分

import { incrementalGroupArticles } from "@/lib/news-grouper";
import { getRssArticlesSince, getRssArticlesBetween, deleteStaleRssArticles } from "@/lib/db";
import type { RssFeedItem } from "@/types";

const WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const body: { items?: RssFeedItem[]; targetDate?: string; enabledSources?: string[] | null } = await request.json();
    const { items, targetDate, enabledSources } = body;
    // null または未指定はフィルタなし、空配列も同様
    const sources = enabledSources && enabledSources.length > 0 ? enabledSources : undefined;

    let merged: RssFeedItem[];

    if (targetDate) {
      // 日付指定モード: targetDate を終端とした3日ウィンドウをDBから取得
      const until = new Date(targetDate);
      until.setHours(23, 59, 59, 999); // 当日末尾まで含む
      const since = new Date(until.getTime() - WINDOW_MS);
      merged = await getRssArticlesBetween(since, until, sources).catch(() => [] as RssFeedItem[]);
    } else {
      // 通常モード: 現在時刻から過去3日 + フレッシュ記事をマージ
      const since = new Date(Date.now() - WINDOW_MS);
      const dbItems = await getRssArticlesSince(since, sources).catch(() => [] as RssFeedItem[]);

      const seen = new Set<string>();
      merged = [];
      for (const item of [...(items ?? []), ...dbItems]) {
        if (!item.url || seen.has(item.url)) continue;
        seen.add(item.url);
        merged.push(item);
      }

      void deleteStaleRssArticles().catch(() => {});
    }

    if (merged.length === 0) return Response.json({ groups: [] });

    const groups = await incrementalGroupArticles(merged);
    return Response.json({ groups });
  } catch (error) {
    const message = error instanceof Error ? error.message : "グループ化に失敗しました";
    console.error("[rss/group] エラー:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
