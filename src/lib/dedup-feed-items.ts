import type { RssFeedItem } from "@/types";

/** URL でデdup（url が空/null の記事は除外）し publishedAt 降順にソートして返す */
export function dedupAndSortFeedItems(items: RssFeedItem[]): RssFeedItem[] {
  const seen = new Set<string>();
  const deduped = items.filter((item) => {
    if (!item.url || seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
  deduped.sort((a, b) => {
    const da = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const db = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return db - da;
  });
  return deduped;
}
