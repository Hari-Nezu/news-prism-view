import type { RssFeedItem } from "@/types";

export function groupItemsBySource(items: RssFeedItem[]): Map<string, RssFeedItem[]> {
  const map = new Map<string, RssFeedItem[]>();
  for (const item of items) {
    if (!map.has(item.source)) map.set(item.source, []);
    map.get(item.source)!.push(item);
  }
  return map;
}
