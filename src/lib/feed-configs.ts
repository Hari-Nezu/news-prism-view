/**
 * フィード設定データ（クライアント・サーバー共用）
 * Node.js 依存を持たないので Client Component からも import 可能。
 */

export interface FeedConfig {
  id: string;
  name: string;
  url: string;
  /** "google-news" の場合、各記事の <source> 要素を媒体名として使用する */
  type: "rss" | "google-news";
  category: string;
  /** true = キーワードフィルタを適用してから返す */
  filterPolitical: boolean;
  /** フィード設定のデフォルト ON/OFF */
  defaultEnabled: boolean;
}

export const ALL_FEED_SOURCES: FeedConfig[] = [
  // ── NHK ──────────────────────────────────────────────────
  {
    id: "nhk-politics",
    name: "NHK政治",
    url: "https://www.nhk.or.jp/rss/news/cat4.xml",
    type: "rss",
    category: "政治",
    filterPolitical: false,
    defaultEnabled: true,
  },
  {
    id: "nhk-international",
    name: "NHK国際",
    url: "https://www.nhk.or.jp/rss/news/cat5.xml",
    type: "rss",
    category: "国際",
    filterPolitical: false,
    defaultEnabled: true,
  },
  {
    id: "nhk-economy",
    name: "NHK経済",
    url: "https://www.nhk.or.jp/rss/news/cat6.xml",
    type: "rss",
    category: "経済",
    filterPolitical: false,
    defaultEnabled: true,
  },
  {
    id: "nhk-society",
    name: "NHK社会",
    url: "https://www.nhk.or.jp/rss/news/cat1.xml",
    type: "rss",
    category: "社会",
    filterPolitical: false,
    defaultEnabled: false,
  },
  // ── 新聞・メディア ────────────────────────────────────────
  {
    id: "asahi",
    name: "朝日新聞",
    url: "https://www.asahi.com/rss/asahi/newsheadlines.rdf",
    type: "rss",
    category: "総合",
    filterPolitical: true,
    defaultEnabled: true,
  },
  {
    id: "sankei",
    name: "産経新聞",
    url: "https://www.sankei.com/rss/news/flash.xml",
    type: "rss",
    category: "総合",
    filterPolitical: true,
    defaultEnabled: true,
  },
  {
    id: "toyokeizai",
    name: "東洋経済オンライン",
    url: "https://toyokeizai.net/list/feed/rss",
    type: "rss",
    category: "経済",
    filterPolitical: true,
    defaultEnabled: true,
  },
  {
    id: "huffpost-jp",
    name: "ハフポスト日本版",
    url: "https://www.huffingtonpost.jp/feeds/index.xml",
    type: "rss",
    category: "総合",
    filterPolitical: true,
    defaultEnabled: true,
  },
  // ── Google News 検索フィード ────────────────────────────────
  {
    id: "gnews-politics",
    name: "Google News 政治",
    url: "https://news.google.com/rss/search?q=%E6%97%A5%E6%9C%AC+%E6%94%BF%E6%B2%BB+OR+%E5%9B%BD%E4%BC%9A+OR+%E9%A6%96%E7%9B%B8&hl=ja&gl=JP&ceid=JP:ja",
    type: "google-news",
    category: "政治",
    filterPolitical: true,
    defaultEnabled: true,
  },
  {
    id: "gnews-economy",
    name: "Google News 経済",
    url: "https://news.google.com/rss/search?q=%E6%97%A5%E6%9C%AC+%E7%B5%8C%E6%B8%88+OR+%E8%B2%A1%E6%94%BF+OR+%E6%97%A5%E9%8A%80&hl=ja&gl=JP&ceid=JP:ja",
    type: "google-news",
    category: "経済",
    filterPolitical: true,
    defaultEnabled: true,
  },
  {
    id: "gnews-world",
    name: "Google News 国際",
    url: "https://news.google.com/rss/search?q=%E5%A4%96%E4%BA%A4+OR+%E9%98%B2%E8%A1%9B+OR+%E5%9B%BD%E9%9A%9B%E6%83%85%E5%8B%A2&hl=ja&gl=JP&ceid=JP:ja",
    type: "google-news",
    category: "国際",
    filterPolitical: true,
    defaultEnabled: true,
  },
];

export const DEFAULT_ENABLED_IDS: string[] = ALL_FEED_SOURCES
  .filter((f) => f.defaultEnabled)
  .map((f) => f.id);

/** カテゴリごとにグループ化して返す */
export function groupFeedsByCategory(): Record<string, FeedConfig[]> {
  const groups: Record<string, FeedConfig[]> = {};
  for (const feed of ALL_FEED_SOURCES) {
    (groups[feed.category] ??= []).push(feed);
  }
  return groups;
}
