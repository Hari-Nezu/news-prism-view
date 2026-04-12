import { describe, it, expect } from "vitest";
import { MEDIA, countArticles } from "@/lib/media-matcher";
import type { NewsGroup } from "@/types";

function findMedia(label: string) {
  const m = MEDIA.find((m) => m.label === label);
  if (!m) throw new Error(`Media not found: ${label}`);
  return m;
}

function makeGroup(sources: string[]): NewsGroup {
  return {
    groupTitle: "test",
    singleOutlet: false,
    items: sources.map((s) => ({ title: "", url: "", source: s })),
  };
}

describe("MEDIA マッチング", () => {
  it("'NHKニュース' → NHK にマッチ", () => {
    const nhk = findMedia("NHK");
    expect(nhk.match("NHKニュース")).toBe(true);
    expect(nhk.match("NHK")).toBe(true);
  });

  it("'朝日新聞デジタル' → 朝日にマッチ", () => {
    const asahi = findMedia("朝日新聞");
    expect(asahi.match("朝日新聞デジタル")).toBe(true);
  });

  it("'日経ビジネス' → 日経にマッチ（startsWith('日経')）", () => {
    const nikkei = findMedia("日本経済新聞");
    expect(nikkei.match("日経ビジネス")).toBe(true);
    expect(nikkei.match("日本経済新聞")).toBe(true);
  });

  it("'東洋経済ONLINE' → 東洋経済オンラインにマッチ（includes('東洋経済')）", () => {
    const toyo = findMedia("東洋経済オンライン");
    expect(toyo.match("東洋経済ONLINE")).toBe(true);
  });

  it("'ハフポスト日本版' → ハフポスト日本版にマッチ", () => {
    const huff = findMedia("ハフポスト日本版");
    expect(huff.match("ハフポスト日本版")).toBe(true);
    expect(huff.match("ハフポスト")).toBe(true);
  });

  it("マッチしないソース → どの MEDIA にも該当しない", () => {
    expect(MEDIA.every((m) => !m.match("Unknown Media XYZ"))).toBe(true);
  });
});

describe("countArticles", () => {
  const nhk = findMedia("NHK");

  it("group.items 内のマッチ記事数を返す", () => {
    const group = makeGroup(["NHKニュース", "朝日新聞デジタル", "NHK Web"]);
    expect(countArticles(group, nhk)).toBe(2);
  });

  it("items が空 → 0", () => {
    expect(countArticles(makeGroup([]), nhk)).toBe(0);
  });

  it("items が undefined → 0", () => {
    const group: NewsGroup = {
      groupTitle: "test",
      singleOutlet: false,
      items: undefined as unknown as NewsGroup["items"],
    };
    expect(countArticles(group, nhk)).toBe(0);
  });
});
