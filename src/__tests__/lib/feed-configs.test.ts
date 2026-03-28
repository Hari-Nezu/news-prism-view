import { describe, it, expect } from "vitest";
import {
  ALL_FEED_SOURCES,
  DEFAULT_ENABLED_IDS,
  groupFeedsByCategory,
  type FeedConfig,
} from "@/lib/feed-configs";

describe("ALL_FEED_SOURCES", () => {
  it("1件以上のフィードが定義されている", () => {
    expect(ALL_FEED_SOURCES.length).toBeGreaterThan(0);
  });

  it("全フィードが必須フィールドを持つ", () => {
    for (const feed of ALL_FEED_SOURCES) {
      expect(feed.id,       `${feed.name}: id が必要`).toBeTruthy();
      expect(feed.name,     `${feed.id}: name が必要`).toBeTruthy();
      expect(feed.url,      `${feed.id}: url が必要`).toBeTruthy();
      expect(feed.category, `${feed.id}: category が必要`).toBeTruthy();
      expect(["rss", "google-news"]).toContain(feed.type);
    }
  });

  it("id が重複していない", () => {
    const ids = ALL_FEED_SOURCES.map((f) => f.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("URL が https:// で始まる", () => {
    for (const feed of ALL_FEED_SOURCES) {
      expect(feed.url, `${feed.id}: URL は https:// で始まる必要がある`).toMatch(/^https:\/\//);
    }
  });
});

describe("DEFAULT_ENABLED_IDS", () => {
  it("1件以上のデフォルト有効フィードがある", () => {
    expect(DEFAULT_ENABLED_IDS.length).toBeGreaterThan(0);
  });

  it("ALL_FEED_SOURCES に存在する id のみ含む", () => {
    const allIds = new Set(ALL_FEED_SOURCES.map((f) => f.id));
    for (const id of DEFAULT_ENABLED_IDS) {
      expect(allIds.has(id), `${id} は ALL_FEED_SOURCES に存在しない`).toBe(true);
    }
  });

  it("defaultEnabled=true のフィードと一致する", () => {
    const expected = ALL_FEED_SOURCES
      .filter((f: FeedConfig) => f.defaultEnabled)
      .map((f: FeedConfig) => f.id)
      .sort();
    expect([...DEFAULT_ENABLED_IDS].sort()).toEqual(expected);
  });
});

describe("groupFeedsByCategory", () => {
  it("カテゴリごとにグループ化される", () => {
    const groups = groupFeedsByCategory();
    expect(Object.keys(groups).length).toBeGreaterThan(0);
  });

  it("全フィードがどこかのカテゴリに含まれる", () => {
    const groups = groupFeedsByCategory();
    const total = Object.values(groups).reduce((sum, arr) => sum + arr.length, 0);
    expect(total).toBe(ALL_FEED_SOURCES.length);
  });

  it("各グループの要素は FeedConfig 型を持つ", () => {
    const groups = groupFeedsByCategory();
    for (const feeds of Object.values(groups)) {
      for (const feed of feeds) {
        expect(feed).toHaveProperty("id");
        expect(feed).toHaveProperty("url");
      }
    }
  });
});
