import * as cheerio from "cheerio";
import type { Article } from "@/types";

/**
 * SSRF対策: ユーザー指定URLがプライベートネットワークを指していないか検証する。
 * - http / https 以外のプロトコルを拒否
 * - ループバック・RFC1918・リンクローカル（AWS メタデータ含む）を拒否
 */
export function validatePublicUrl(urlStr: string): void {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw new Error("無効なURLです");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("http/https 以外のプロトコルは許可されていません");
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, ""); // IPv6ブラケット除去

  const BLOCKED_HOSTS = ["localhost", "metadata.google.internal", "::1"];
  if (BLOCKED_HOSTS.includes(host)) {
    throw new Error("このURLへのアクセスは許可されていません");
  }

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)
    ) {
      throw new Error("プライベートIPアドレスへのアクセスは許可されていません");
    }
  }
}

/**
 * URLから記事本文を取得する
 * スクレイピングではなく、公開HTMLの本文テキスト抽出
 */
export async function fetchArticleFromUrl(url: string): Promise<Article> {
  validatePublicUrl(url);

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
