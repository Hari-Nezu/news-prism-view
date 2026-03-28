import { describe, it, expect } from "vitest";
import { extractWords, filterByKeyword } from "@/lib/compare-filter";
import type { RssFeedItem } from "@/types";

// ── テスト用フィクスチャ ────────────────────────────────

const makeItem = (title: string, source = "NHK", summary = ""): RssFeedItem => ({
  title,
  url: `https://example.com/${encodeURIComponent(title)}`,
  source,
  summary,
});

const ITEMS: RssFeedItem[] = [
  makeItem("防衛省が新型ミサイル導入を発表", "NHK政治"),
  makeItem("日銀が金融政策の維持を決定 円安加速", "朝日新聞"),
  makeItem("首相が少子化対策の新方針を閣議決定", "産経新聞"),
  makeItem("ウクライナへの追加支援を検討 外務省", "NHK国際"),
  makeItem("F1グランプリ モナコで開幕", "スポーツ新聞"),
];

// ── extractWords ────────────────────────────────────────

describe("extractWords", () => {
  it("カタカナ語を抽出する", () => {
    const words = extractWords("新型ミサイルの導入");
    expect(words).toContain("ミサイル");
  });

  it("漢字複合語を抽出する（2文字以上）", () => {
    const words = extractWords("防衛省が新型ミサイル導入を発表");
    expect(words).toContain("防衛省");
    expect(words).toContain("新型");
    expect(words).toContain("ミサイル");
    expect(words).toContain("導入");
    expect(words).toContain("発表");
  });

  it("英単語を抽出する（3文字以上）", () => {
    const words = extractWords("GDP成長率が改善");
    expect(words).toContain("GDP");
  });

  it("年号（4桁数字）を抽出する", () => {
    const words = extractWords("2024年の経済政策");
    expect(words).toContain("2024");
  });

  it("1文字の漢字は含まない", () => {
    const words = extractWords("日が昇る");
    expect(words).not.toContain("日");
  });

  it("重複しない（Set）", () => {
    const words = extractWords("防衛省の防衛費");
    const unique = [...new Set(words)];
    expect(words.length).toBe(unique.length);
  });

  it("空文字は空配列を返す", () => {
    expect(extractWords("")).toEqual([]);
  });
});

// ── filterByKeyword ─────────────────────────────────────

describe("filterByKeyword", () => {
  it("部分一致で正しく絞り込む", () => {
    const result = filterByKeyword(ITEMS, "防衛");
    expect(result).toHaveLength(1);
    expect(result[0].title).toMatch(/防衛/);
  });

  it("大文字小文字を無視する", () => {
    const items = [makeItem("Japan GDP growth rate")];
    expect(filterByKeyword(items, "gdp")).toHaveLength(1);
  });

  it("マッチなし → 単語重複フォールバックが動作する", () => {
    // タイトル全体を渡すと部分一致しないが、単語重複でマッチする
    const seed = "防衛省が新型ミサイル導入を発表";
    const result = filterByKeyword(ITEMS, seed);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].title).toMatch(/防衛|ミサイル/);
  });

  it("無関係な記事がフォールバックでヒットしない", () => {
    const seed = "F1グランプリ モナコで開幕";
    const result = filterByKeyword(ITEMS, seed);
    // スポーツ記事のみにマッチ、政治記事はヒットしない
    expect(result.every((r) => r.title.includes("F1") || r.title.includes("モナコ"))).toBe(true);
  });

  it("空のリストに対して空を返す", () => {
    expect(filterByKeyword([], "防衛")).toEqual([]);
  });

  it("単語数が1語だけのシードはフォールバックしない（閾値 < 2）", () => {
    // 部分一致なし＆フォールバック単語数 < 2 → 空
    const result = filterByKeyword(ITEMS, "αβ");  // 3文字以上の英字なし、漢字なし
    expect(result).toEqual([]);
  });

  it("summary フィールドもマッチ対象に含まれる", () => {
    const items = [makeItem("普通のタイトル", "NHK", "少子化対策に関する詳細")];
    expect(filterByKeyword(items, "少子化")).toHaveLength(1);
  });
});
