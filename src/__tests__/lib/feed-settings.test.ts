import { describe, it, expect, vi, afterEach } from "vitest";
import {
  loadFeedSettings,
  saveFeedSettings,
  DEFAULT_VISIBLE_TOPICS,
} from "@/components/FeedSettingsDrawer";
import { DEFAULT_ENABLED_IDS } from "@/lib/config/feed-configs";

const STORAGE_KEY = "newsprism:feed-settings";

function mockLocalStorage(initial: Record<string, string> = {}) {
  const store: Record<string, string> = { ...initial };
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    _store: store,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadFeedSettings", () => {
  it("window が undefined（SSR） → デフォルト値", () => {
    // Node 環境では window が undefined なのでそのまま呼ぶ
    const result = loadFeedSettings();
    expect(result.enabledIds).toEqual(DEFAULT_ENABLED_IDS);
    expect(result.customFeeds).toEqual([]);
    expect(result.visibleTopics).toEqual(DEFAULT_VISIBLE_TOPICS);
  });

  it("localStorage が空 → デフォルト値を返す", () => {
    const ls = mockLocalStorage();
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", ls);
    expect(loadFeedSettings().enabledIds).toEqual(DEFAULT_ENABLED_IDS);
  });

  it("localStorage に valid JSON → パースして返す", () => {
    const settings = { enabledIds: ["nhk"], customFeeds: [], visibleTopics: ["politics"] };
    const ls = mockLocalStorage({ [STORAGE_KEY]: JSON.stringify(settings) });
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", ls);
    const result = loadFeedSettings();
    expect(result.enabledIds).toEqual(["nhk"]);
    expect(result.visibleTopics).toEqual(["politics"]);
  });

  it("localStorage に壊れた JSON → デフォルト値を返す", () => {
    const ls = mockLocalStorage({ [STORAGE_KEY]: "{bad json" });
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", ls);
    expect(loadFeedSettings().enabledIds).toEqual(DEFAULT_ENABLED_IDS);
  });

  it("enabledIds が配列でない → デフォルト値にフォールバック", () => {
    const settings = { enabledIds: "not-an-array", customFeeds: [], visibleTopics: [] };
    const ls = mockLocalStorage({ [STORAGE_KEY]: JSON.stringify(settings) });
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", ls);
    expect(loadFeedSettings().enabledIds).toEqual(DEFAULT_ENABLED_IDS);
  });
});

describe("saveFeedSettings", () => {
  it("localStorage に JSON を書き込む", () => {
    const ls = mockLocalStorage();
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", ls);
    const settings = { enabledIds: ["nhk"], customFeeds: [], visibleTopics: [] };
    saveFeedSettings(settings);
    expect(JSON.parse(ls._store[STORAGE_KEY])).toEqual(settings);
  });

  it("window が undefined → 何もしない（エラーにならない）", () => {
    // Node 環境では window が undefined
    expect(() =>
      saveFeedSettings({ enabledIds: [], customFeeds: [], visibleTopics: [] })
    ).not.toThrow();
  });
});
