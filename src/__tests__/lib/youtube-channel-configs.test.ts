import { describe, it, expect } from "vitest";
import {
  ALL_YOUTUBE_CHANNELS,
  DEFAULT_ENABLED_CHANNEL_IDS,
} from "@/lib/config/youtube-channel-configs";

describe("ALL_YOUTUBE_CHANNELS", () => {
  it("1件以上のチャンネルが定義されている", () => {
    expect(ALL_YOUTUBE_CHANNELS.length).toBeGreaterThan(0);
  });

  it("全チャンネルが必須フィールドを持つ (id, name, channelId, category)", () => {
    for (const ch of ALL_YOUTUBE_CHANNELS) {
      expect(ch.id,        `${ch.name}: id が必要`).toBeTruthy();
      expect(ch.name,      `${ch.id}: name が必要`).toBeTruthy();
      expect(ch.channelId, `${ch.id}: channelId が必要`).toBeTruthy();
      expect(ch.category,  `${ch.id}: category が必要`).toBeTruthy();
    }
  });

  it("id が重複していない", () => {
    const ids = ALL_YOUTUBE_CHANNELS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("channelId が UC で始まる", () => {
    for (const ch of ALL_YOUTUBE_CHANNELS) {
      expect(ch.channelId, `${ch.id}: channelId は UC で始まる必要がある`).toMatch(/^UC/);
    }
  });

  it("category が 'mainstream' | 'independent' | 'commentary' のいずれか", () => {
    const validCategories = ["mainstream", "independent", "commentary"];
    for (const ch of ALL_YOUTUBE_CHANNELS) {
      expect(validCategories, `${ch.id}: 不正なカテゴリ "${ch.category}"`).toContain(ch.category);
    }
  });
});

describe("DEFAULT_ENABLED_CHANNEL_IDS", () => {
  it("ALL_YOUTUBE_CHANNELS に存在する id のみ含む", () => {
    const allIds = new Set(ALL_YOUTUBE_CHANNELS.map((c) => c.id));
    for (const id of DEFAULT_ENABLED_CHANNEL_IDS) {
      expect(allIds.has(id), `${id} は ALL_YOUTUBE_CHANNELS に存在しない`).toBe(true);
    }
  });

  it("defaultEnabled=true のチャンネルと DEFAULT_ENABLED_CHANNEL_IDS が一致", () => {
    const expected = ALL_YOUTUBE_CHANNELS
      .filter((c) => c.defaultEnabled)
      .map((c) => c.id)
      .sort();
    expect([...DEFAULT_ENABLED_CHANNEL_IDS].sort()).toEqual(expected);
  });
});
