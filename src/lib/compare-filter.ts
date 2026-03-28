import type { RssFeedItem } from "@/types";

/**
 * 日本語テキストから意味のある語（カタカナ・漢字複合語・英単語）を抽出する。
 * RSS記事タイトルをシードにした比較検索時の単語重複マッチに使用する。
 */
export function extractWords(text: string): string[] {
  const patterns = [
    /[\u30A0-\u30FF]{2,}/g,  // カタカナ語（ミサイル、アメリカ等）
    /[\u4E00-\u9FFF]{2,}/g,  // 漢字複合語（防衛省、首相等）
    /[a-zA-Z]{3,}/g,          // 英単語
    /\d{4}/g,                 // 年号（2024等）
  ];
  const words = new Set<string>();
  for (const pattern of patterns) {
    for (const m of text.match(pattern) ?? []) words.add(m);
  }
  return [...words];
}

/**
 * キーワードに合致する記事を抽出する。
 * 1) 部分一致（完全文字列）
 * 2) マッチ 0 件の場合、単語重複フォールバック（記事タイトルをシードにした比較向け）
 */
export function filterByKeyword(
  allItems: RssFeedItem[],
  keyword: string
): RssFeedItem[] {
  const kw = keyword.toLowerCase();

  // ① 部分一致
  const exact = allItems.filter((item) =>
    `${item.title} ${item.summary ?? ""}`.toLowerCase().includes(kw)
  );
  if (exact.length > 0) return exact;

  // ② 単語重複フォールバック（タイトルをそのまま渡された場合など）
  const seedWords = extractWords(keyword);
  if (seedWords.length < 2) return [];

  const threshold = Math.max(2, Math.ceil(seedWords.length * 0.35));
  return allItems.filter((item) => {
    const text = `${item.title} ${item.summary ?? ""}`;
    const hits = seedWords.filter((w) => text.includes(w)).length;
    return hits >= threshold;
  });
}
