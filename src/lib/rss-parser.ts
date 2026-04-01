import Parser from "rss-parser";
import type { RssFeedItem } from "@/types";
import { ALL_FEED_SOURCES, DEFAULT_ENABLED_IDS, type FeedConfig } from "./config/feed-configs";
import { fetchNewsdataArticles } from "./newsdata-client";
import { classifyArticlesBatchLLM } from "./news-classifier-llm";
import { validatePublicUrl } from "./article-fetcher";

const parser = new Parser({
  timeout: 10000,
  headers: {
    "User-Agent": "NewsPrismView/1.0",
  },
  customFields: {
    item: [
      ["media:content",   "mediaContent"],
      ["media:thumbnail", "mediaThumbnail"],
      "enclosure",
      ["source",          "gnSource"],   // Google News の媒体名
    ],
  },
});

// 政治・外交・安保・経済政策に関連するキーワード
const POLITICAL_KEYWORDS = [
  // 政治・行政
  "政府", "首相", "大臣", "国会", "議員", "与党", "野党", "自民党", "立憲", "公明党",
  "維新", "共産党", "選挙", "投票", "政策", "法案", "閣議", "内閣", "官房長官",
  // 外交・安保
  "外交", "外務省", "防衛", "安全保障", "自衛隊", "米軍", "日米", "日中", "日韓",
  "北朝鮮", "ミサイル", "核", "条約", "制裁", "G7", "G20", "国連", "NATO",
  "中国", "ロシア", "ウクライナ", "台湾", "韓国", "アメリカ", "米国", "欧州",
  // 経済政策
  "財政", "税制", "増税", "減税", "予算", "補正予算", "GDP", "景気", "物価",
  "インフレ", "金利", "日銀", "金融政策", "規制", "改革",
];

// 除外キーワード（スポーツ・芸能・天気等）
const EXCLUDE_KEYWORDS = [
  "野球", "サッカー", "オリンピック", "芸能", "俳優", "タレント", "映画",
  "天気", "地震", "台風", "交通事故",
];

function isPolitical(title: string, summary?: string): boolean {
  const text = `${title} ${summary ?? ""}`;
  if (EXCLUDE_KEYWORDS.some((kw) => text.includes(kw))) return false;
  return POLITICAL_KEYWORDS.some((kw) => text.includes(kw));
}

/** gnSource フィールドから媒体名を取り出す（text 付き or 文字列） */
function extractGnSource(gnSource: unknown): string | undefined {
  if (!gnSource) return undefined;
  if (typeof gnSource === "string") return gnSource.trim() || undefined;
  if (typeof gnSource === "object" && gnSource !== null) {
    const raw = gnSource as Record<string, unknown>;
    const text = typeof raw._ === "string" ? raw._.trim() : undefined;
    return text || undefined;
  }
  return undefined;
}

/** Google News タイトル末尾の " - 媒体名" を除去する */
function stripGnSourceSuffix(title: string, sourceName: string): string {
  const escaped = sourceName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return title.replace(new RegExp(`\\s*-\\s*${escaped}\\s*$`), "").trim() || title;
}

// ──────────────────────────────────────────────────────────
// 公開 API
// ──────────────────────────────────────────────────────────

/**
 * 任意の RSS/Atom フィードを取得して RssFeedItem[] に変換する。
 * 後方互換のため旧シグネチャを維持する。
 */
export async function fetchRssFeed(
  feedUrl: string,
  sourceName: string,
  filterPolitical = true
): Promise<RssFeedItem[]> {
  validatePublicUrl(feedUrl);
  const feed = await parser.parseURL(feedUrl);

  const rawItems = (feed.items ?? []).map((item) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = item as any;
    const imageUrl: string | undefined =
      raw.enclosure?.url ||
      raw.mediaContent?.["$"]?.url ||
      raw.mediaThumbnail?.["$"]?.url ||
      undefined;

    const title = item.title ?? "タイトル不明";
    const summary = item.contentSnippet ?? item.summary ?? undefined;
    return {
      title,
      url: item.link ?? "",
      summary,
      publishedAt: item.pubDate ?? item.isoDate ?? undefined,
      source: sourceName,
      imageUrl,
    };
  });

  const isAlreadyFiltered = sourceName.startsWith("NHK");
  const filtered = (!filterPolitical || isAlreadyFiltered)
    ? rawItems.slice(0, 10)
    : rawItems.filter((item) => isPolitical(item.title, item.summary)).slice(0, 10);

  const classifications = await classifyArticlesBatchLLM(filtered);
  return filtered.map((item, i) => ({
    ...item,
    topic:       classifications[i].category,
    subcategory: classifications[i].subcategory,
  }));
}

/** FeedConfig をもとにフィードを取得する（Google News 媒体名抽出対応） */
async function fetchFeedByConfig(config: FeedConfig): Promise<RssFeedItem[]> {
  const feed = await parser.parseURL(config.url);
  const isGoogleNews = config.type === "google-news";

  const rawItems = (feed.items ?? []).map((item) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = item as any;
    const imageUrl: string | undefined =
      raw.enclosure?.url ||
      raw.mediaContent?.["$"]?.url ||
      raw.mediaThumbnail?.["$"]?.url ||
      undefined;

    // Google News フィードは個々の記事に媒体名が入っている
    const gnSource = extractGnSource(raw.gnSource);
    const sourceName = isGoogleNews && gnSource ? gnSource : config.name;

    // Google News タイトルの " - 媒体名" を除去
    const rawTitle = item.title ?? "タイトル不明";
    const title = isGoogleNews && gnSource
      ? stripGnSourceSuffix(rawTitle, gnSource)
      : rawTitle;
    const summary = item.contentSnippet ?? item.summary ?? undefined;

    return {
      title,
      url: item.link ?? "",
      summary,
      publishedAt: item.pubDate ?? item.isoDate ?? undefined,
      source: sourceName,
      imageUrl,
    };
  });

  const filtered = !config.filterPolitical
    ? rawItems.slice(0, 15)
    : rawItems.filter((item) => isPolitical(item.title, item.summary)).slice(0, 10);

  // 分類はfetchAllDefaultFeeds側でまとめて実施するため、ここではtopic未設定で返す
  return filtered as RssFeedItem[];
}

/**
 * 有効なフィード一覧からまとめて取得する。
 * - enabledIds が undefined → defaultEnabled なフィードのみ（デフォルト挙動）
 * - enabledIds が string[] → 指定 ID のフィードのみ
 */
export async function fetchAllDefaultFeeds(
  enabledIds?: string[]
): Promise<RssFeedItem[]> {
  const idsToUse = enabledIds ?? DEFAULT_ENABLED_IDS;
  const feedsToFetch = ALL_FEED_SOURCES.filter((f) => idsToUse.includes(f.id));

  const [rssResults, newsdataItems] = await Promise.all([
    Promise.allSettled(feedsToFetch.map((f) => fetchFeedByConfig(f))),
    fetchNewsdataArticles().catch(() => []),
  ]);

  const rssItems = rssResults
    .filter((r): r is PromiseFulfilledResult<RssFeedItem[]> => r.status === "fulfilled")
    .flatMap((r) => r.value);

  const all = [...rssItems, ...newsdataItems];

  // URL で重複除去
  const seen = new Set<string>();
  const deduped = all.filter((item) => {
    if (!item.url || seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });

  const sorted = deduped.sort((a, b) => {
    const da = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const db = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return db - da;
  });

  // 未分類の記事を一括でLLM分類（fetchFeedByConfig では topic を付けていない）
  const unclassified = sorted.filter((item) => !item.topic);
  if (unclassified.length > 0) {
    const classifications = await classifyArticlesBatchLLM(unclassified);
    unclassified.forEach((item, i) => {
      item.topic       = classifications[i].category;
      item.subcategory = classifications[i].subcategory;
    });
  }

  return sorted;
}

// 後方互換エクスポート（compare/route.ts 等が参照）
export const DEFAULT_RSS_FEEDS = ALL_FEED_SOURCES
  .filter((f) => f.defaultEnabled)
  .map((f) => ({ name: f.name, url: f.url }));
