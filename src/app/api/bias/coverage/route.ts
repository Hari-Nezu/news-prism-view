export const maxDuration = 300;

import { fetchAllDefaultFeeds } from "@/lib/rss-parser";
import { groupArticlesByEvent } from "@/lib/news-grouper";
import { BIAS_MEDIA_IDS, ALL_FEED_SOURCES } from "@/lib/config/feed-configs";
import type { RssFeedItem } from "@/types";

export interface CoverageGroup {
  groupTitle: string;
  topic: string;          // = groupTitle（具体的なイベント名）
  category: string;       // 大分類（"politics" | "economy" | ...）
  coveredBy: string[];    // 報じた媒体名（config.name）
  silentMedia: string[];  // 報じなかった媒体名
  items: RssFeedItem[];
}

export interface CoverageResponse {
  groups: CoverageGroup[];
  fetchedMedia: string[]; // 今回取得できた媒体名一覧
  fetchedAt: string;
}

export async function GET() {
  try {
    const biasIds = [...BIAS_MEDIA_IDS];
    const mediaNames = biasIds.map(
      (id) => ALL_FEED_SOURCES.find((f) => f.id === id)?.name ?? id
    );

    // 15社から記事を取得
    const items = await fetchAllDefaultFeeds(biasIds);

    // 取得できた媒体（記事が1件以上あったもの）
    const fetchedMediaSet = new Set(items.map((i) => i.source));
    const fetchedMedia = mediaNames.filter((n) => fetchedMediaSet.has(n));

    // トピックグループにまとめる（DB非依存のインメモリクラスタリング）
    const groups = await groupArticlesByEvent(items);

    // 各グループの報道有無を計算
    const coverageGroups: CoverageGroup[] = groups.map((g) => {
      const coveredBy = [...new Set(g.items.map((i) => i.source))].sort();
      const silentMedia = fetchedMedia.filter((m) => !coveredBy.includes(m)).sort();
      return {
        groupTitle:  g.groupTitle,
        topic:       g.topic ?? g.groupTitle,
        category:    g.category ?? "other",
        coveredBy,
        silentMedia,
        items:       g.items,
      };
    });

    return Response.json({
      groups: coverageGroups,
      fetchedMedia,
      fetchedAt: new Date().toISOString(),
    } satisfies CoverageResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "カバレッジ取得に失敗しました";
    console.error("[bias/coverage] エラー:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
