import * as cheerio from "cheerio";
import type { Article } from "@/types";

/**
 * URLから記事本文を取得する
 * スクレイピングではなく、公開HTMLの本文テキスト抽出
 */
export async function fetchArticleFromUrl(url: string): Promise<Article> {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; NewsPrismView/1.0; +https://github.com/news-prism-view)",
      Accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`記事の取得に失敗しました: ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  // metaタグからタイトルと公開日を取得
  const title =
    $('meta[property="og:title"]').attr("content") ||
    $("title").text() ||
    "タイトル不明";

  const publishedAt =
    $('meta[property="article:published_time"]').attr("content") ||
    $('meta[name="date"]').attr("content") ||
    undefined;

  const source = new URL(url).hostname;

  // 本文抽出: 不要な要素を除去してからテキストを取得
  $("script, style, nav, header, footer, aside, .ad, .advertisement").remove();

  // article タグ → main タグ → body の順に試行
  const contentEl =
    $("article").length > 0
      ? $("article")
      : $("main").length > 0
        ? $("main")
        : $("body");

  const content = contentEl
    .text()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 5000);

  if (content.length < 100) {
    throw new Error("記事本文を抽出できませんでした（文字数不足）");
  }

  return { title, content, url, publishedAt, source };
}
