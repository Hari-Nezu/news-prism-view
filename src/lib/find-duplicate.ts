import type { Article, MultiModelAnalyzedArticle } from "@/types";

/** URL または タイトルで既分析済みの記事インデックスを返す */
export function findDuplicateIndex(
  articles: MultiModelAnalyzedArticle[],
  article: Pick<Article, "url" | "title">
): number {
  if (article.url) {
    const idx = articles.findIndex((a) => a.url === article.url);
    if (idx !== -1) return idx;
  }
  return articles.findIndex((a) => a.title === article.title);
}
