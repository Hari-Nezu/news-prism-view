import { describe, it, expect } from "vitest";
import { dedupAndSortFeedItems } from "@/lib/dedup-feed-items";
import type { RssFeedItem } from "@/types";

function makeItem(url: string, publishedAt?: string): RssFeedItem {
  return { title: "test", url, source: "NHK", publishedAt };
}

describe("dedupAndSortFeedItems", () => {
  it("同一URLの記事を重複排除", () => {
    const items = [
      makeItem("https://example.com/1"),
      makeItem("https://example.com/1"),
      makeItem("https://example.com/2"),
    ];
    expect(dedupAndSortFeedItems(items)).toHaveLength(2);
  });

  it("url が空の記事は除外", () => {
    const items = [makeItem(""), makeItem("https://example.com/1")];
    const result = dedupAndSortFeedItems(items);
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe("https://example.com/1");
  });

  it("publishedAt の降順ソート（新しい順）", () => {
    const items = [
      makeItem("https://example.com/1", "2025-01-01T00:00:00Z"),
      makeItem("https://example.com/2", "2025-01-03T00:00:00Z"),
      makeItem("https://example.com/3", "2025-01-02T00:00:00Z"),
    ];
    const result = dedupAndSortFeedItems(items);
    expect(result[0].url).toBe("https://example.com/2");
    expect(result[1].url).toBe("https://example.com/3");
    expect(result[2].url).toBe("https://example.com/1");
  });

  it("publishedAt がない記事は末尾", () => {
    const items = [
      makeItem("https://example.com/1"),                              // publishedAt なし
      makeItem("https://example.com/2", "2025-01-01T00:00:00Z"),
    ];
    const result = dedupAndSortFeedItems(items);
    expect(result[0].url).toBe("https://example.com/2");
    expect(result[1].url).toBe("https://example.com/1");
  });

  it("入力が空配列 → 空配列", () => {
    expect(dedupAndSortFeedItems([])).toEqual([]);
  });
});
