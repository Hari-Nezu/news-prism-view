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
  /**
   * source フィールドをこの名前に固定する。
   * Google News site: フィードで <source> が "読売新聞オンライン" のように
   * 表記揺れする場合に config.name と統一するために使用する。
   */
  canonicalSource?: string;
}

export const ALL_FEED_SOURCES: FeedConfig[] = [
  // ── Google News トピック別（デフォルト有効） ────────────────
  {
    id: "gnews-politics",
    name: "Google News 政治",
    url: "https://news.google.com/rss/search?q=%E6%97%A5%E6%9C%AC+%E6%94%BF%E6%B2%BB+OR+%E5%9B%BD%E4%BC%9A+OR+%E9%A6%96%E7%9B%B8&hl=ja&gl=JP&ceid=JP:ja",
    type: "google-news",
    category: "政治",
    filterPolitical: false,
    defaultEnabled: true,
  },
  {
    id: "gnews-economy",
    name: "Google News 経済",
    url: "https://news.google.com/rss/search?q=%E6%97%A5%E6%9C%AC+%E7%B5%8C%E6%B8%88+OR+%E8%B2%A1%E6%94%BF+OR+%E6%97%A5%E9%8A%80&hl=ja&gl=JP&ceid=JP:ja",
    type: "google-news",
    category: "経済",
    filterPolitical: false,
    defaultEnabled: true,
  },
  {
    id: "gnews-world",
    name: "Google News 国際",
    url: "https://news.google.com/rss/search?q=%E5%A4%96%E4%BA%A4+OR+%E9%98%B2%E8%A1%9B+OR+%E5%9B%BD%E9%9A%9B%E6%83%85%E5%8B%A2&hl=ja&gl=JP&ceid=JP:ja",
    type: "google-news",
    category: "国際",
    filterPolitical: false,
    defaultEnabled: true,
  },

  // ── バイアス分析対象 15社（直接 RSS） ───────────────────────
  {
    id: "nhk",
    name: "NHK",
    url: "https://www.nhk.or.jp/rss/news/cat0.xml",
    type: "rss",
    category: "総合",
    filterPolitical: false,
    defaultEnabled: false,
  },
  {
    id: "asahi",
    name: "朝日新聞",
    url: "https://www.asahi.com/rss/asahi/newsheadlines.rdf",
    type: "rss",
    category: "総合",
    filterPolitical: false,
    defaultEnabled: false,
  },
  {
    id: "mainichi",
    name: "毎日新聞",
    url: "https://mainichi.jp/rss/etc/mainichi-flash.rss",
    type: "rss",
    category: "総合",
    filterPolitical: false,
    defaultEnabled: false,
  },
  {
    id: "sankei",
    name: "産経新聞",
    url: "https://www.sankei.com/rss/news/flash.xml",
    type: "rss",
    category: "総合",
    filterPolitical: false,
    defaultEnabled: false,
  },
  {
    id: "toyokeizai",
    name: "東洋経済オンライン",
    url: "https://toyokeizai.net/list/feed/rss",
    type: "rss",
    category: "総合",
    filterPolitical: false,
    defaultEnabled: false,
  },
  {
    id: "huffpost-jp",
    name: "ハフポスト日本版",
    url: "https://www.huffingtonpost.jp/feeds/index.xml",
    type: "rss",
    category: "総合",
    filterPolitical: false,
    defaultEnabled: false,
  },

  // ── バイアス分析対象 15社（Google News site: フィルタ） ──────
  // canonicalSource: <source> タグの表記揺れを config.name に統一する
  {
    id: "yomiuri",
    name: "読売新聞",
    url: "https://news.google.com/rss/search?q=site:yomiuri.co.jp&hl=ja&gl=JP&ceid=JP:ja",
    type: "google-news",
    category: "総合",
    filterPolitical: false,
    defaultEnabled: false,
    canonicalSource: "読売新聞",
  },
  {
    id: "nikkei",
    name: "日本経済新聞",
    url: "https://news.google.com/rss/search?q=site:nikkei.com&hl=ja&gl=JP&ceid=JP:ja",
    type: "google-news",
    category: "総合",
    filterPolitical: false,
    defaultEnabled: false,
    canonicalSource: "日本経済新聞",
  },
  {
    id: "tokyo-np",
    name: "東京新聞",
    url: "https://news.google.com/rss/search?q=site:tokyo-np.co.jp&hl=ja&gl=JP&ceid=JP:ja",
    type: "google-news",
    category: "総合",
    filterPolitical: false,
    defaultEnabled: false,
    canonicalSource: "東京新聞",
  },
  {
    id: "jiji",
    name: "時事通信",
    url: "https://news.google.com/rss/search?q=site:jiji.com&hl=ja&gl=JP&ceid=JP:ja",
    type: "google-news",
    category: "総合",
    filterPolitical: false,
    defaultEnabled: false,
    canonicalSource: "時事通信",
  },
  {
    id: "kyodo",
    name: "共同通信",
    url: "https://news.google.com/rss/search?q=site:kyodonews.jp&hl=ja&gl=JP&ceid=JP:ja",
    type: "google-news",
    category: "総合",
    filterPolitical: false,
    defaultEnabled: false,
    canonicalSource: "共同通信",
  },
  {
    id: "tbs-news",
    name: "TBSニュース",
    url: "https://news.google.com/rss/search?q=site:news.tbs.co.jp&hl=ja&gl=JP&ceid=JP:ja",
    type: "google-news",
    category: "総合",
    filterPolitical: false,
    defaultEnabled: false,
    canonicalSource: "TBSニュース",
  },
  {
    id: "tv-asahi",
    name: "テレビ朝日",
    url: "https://news.google.com/rss/search?q=site:news.tv-asahi.co.jp&hl=ja&gl=JP&ceid=JP:ja",
    type: "google-news",
    category: "総合",
    filterPolitical: false,
    defaultEnabled: false,
    canonicalSource: "テレビ朝日",
  },
  {
    id: "ntv",
    name: "日本テレビ",
    url: "https://news.google.com/rss/search?q=site:news.ntv.co.jp&hl=ja&gl=JP&ceid=JP:ja",
    type: "google-news",
    category: "総合",
    filterPolitical: false,
    defaultEnabled: false,
    canonicalSource: "日本テレビ",
  },
  {
    id: "fnn",
    name: "フジテレビ",
    url: "https://news.google.com/rss/search?q=site:fnn.jp&hl=ja&gl=JP&ceid=JP:ja",
    type: "google-news",
    category: "総合",
    filterPolitical: false,
    defaultEnabled: false,
    canonicalSource: "フジテレビ",
  },

  // ── NHK カテゴリ別（サブフィード・非デフォルト） ────────────
  {
    id: "nhk-politics",
    name: "NHK政治",
    url: "https://www.nhk.or.jp/rss/news/cat4.xml",
    type: "rss",
    category: "政治",
    filterPolitical: false,
    defaultEnabled: false,
  },
  {
    id: "nhk-international",
    name: "NHK国際",
    url: "https://www.nhk.or.jp/rss/news/cat5.xml",
    type: "rss",
    category: "国際",
    filterPolitical: false,
    defaultEnabled: false,
  },
  {
    id: "nhk-economy",
    name: "NHK経済",
    url: "https://www.nhk.or.jp/rss/news/cat6.xml",
    type: "rss",
    category: "経済",
    filterPolitical: false,
    defaultEnabled: false,
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
];

export const DEFAULT_ENABLED_IDS: string[] = ALL_FEED_SOURCES
  .filter((f) => f.defaultEnabled)
  .map((f) => f.id);

/** バイアス分析対象の15社 ID */
export const BIAS_MEDIA_IDS = [
  "nhk", "asahi", "mainichi", "yomiuri", "nikkei",
  "sankei", "tokyo-np", "jiji", "kyodo",
  "tbs-news", "tv-asahi", "ntv", "fnn",
  "toyokeizai", "huffpost-jp",
] as const;

export type BiasMediaId = typeof BIAS_MEDIA_IDS[number];

/** カテゴリごとにグループ化して返す */
export function groupFeedsByCategory(): Record<string, FeedConfig[]> {
  const groups: Record<string, FeedConfig[]> = {};
  for (const feed of ALL_FEED_SOURCES) {
    (groups[feed.category] ??= []).push(feed);
  }
  return groups;
}
