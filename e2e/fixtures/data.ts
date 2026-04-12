import type { RssFeedItem, NewsGroup, SnapshotMeta, FeedGroupWithItems, GroupInspectDetail } from "@/types";

const now = new Date().toISOString();
const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();
const twoHoursAgo = new Date(Date.now() - 7200_000).toISOString();

export const RSS_FIXTURE: RssFeedItem[] = [
  {
    title: "テスト記事1: 防衛費増額を閣議決定",
    url: "https://example.com/article-1",
    source: "NHKニュース",
    publishedAt: now,
    category: "politics",
  },
  {
    title: "テスト記事2: 日経平均が4万円突破",
    url: "https://example.com/article-2",
    source: "日本経済新聞",
    publishedAt: oneHourAgo,
    category: "economy",
  },
  {
    title: "テスト記事3: 少子化対策の新方針",
    url: "https://example.com/article-3",
    source: "朝日新聞デジタル",
    publishedAt: oneHourAgo,
    category: "society",
  },
  {
    title: "テスト記事4: 日米首脳会談の詳細",
    url: "https://example.com/article-4",
    source: "毎日新聞",
    publishedAt: twoHoursAgo,
    category: "politics",
  },
  {
    title: "テスト記事5: 物価上昇が続く",
    url: "https://example.com/article-5",
    source: "読売新聞オンライン",
    publishedAt: twoHoursAgo,
    category: "economy",
  },
];

export const BATCH_LATEST_FIXTURE = {
  snapshot: {
    id: "snap-001",
    processedAt: now,
    articleCount: 120,
    groupCount: 15,
    durationMs: 3500,
    status: "success",
    error: null,
  } satisfies SnapshotMeta,
  groups: [
    {
      id: "grp-001",
      groupTitle: "防衛費増額の閣議決定",
      items: [
        { title: "防衛費増額決定", url: "https://example.com/1", source: "NHKニュース", publishedAt: now },
        { title: "防衛費が過去最大に", url: "https://example.com/2", source: "朝日新聞デジタル", publishedAt: now },
        { title: "防衛費増額、野党反発", url: "https://example.com/3", source: "毎日新聞", publishedAt: now },
      ],
      singleOutlet: false,
      category: "politics",
      coveredBy: ["NHK", "朝日"],
      silentMedia: ["読売"],
    },
    {
      id: "grp-002",
      groupTitle: "日経平均4万円突破",
      items: [
        { title: "日経平均が節目の4万円を突破", url: "https://example.com/4", source: "日本経済新聞", publishedAt: oneHourAgo },
        { title: "株価4万円の意味", url: "https://example.com/5", source: "東洋経済ONLINE", publishedAt: oneHourAgo },
      ],
      singleOutlet: false,
      category: "economy",
      coveredBy: ["日経"],
      silentMedia: [],
    },
    {
      id: "grp-003",
      groupTitle: "NHK独自報道",
      items: [
        { title: "NHK独自：特定の記事", url: "https://example.com/6", source: "NHKニュース", publishedAt: twoHoursAgo },
      ],
      singleOutlet: true,
      category: "politics",
      coveredBy: [],
      silentMedia: [],
    },
  ] satisfies NewsGroup[],
};

export const FEED_GROUPS_FIXTURE: FeedGroupWithItems[] = [
  {
    id: "fg-001",
    title: "防衛費増額の閣議決定",
    articleCount: 3,
    lastSeenAt: now,
    createdAt: twoHoursAgo,
    uniqueSourceCount: 3,
    singleOutlet: false,
    items: [
      { id: "item-1", title: "防衛費増額決定", url: "https://example.com/1", source: "NHKニュース", publishedAt: now, matchedAt: now },
      { id: "item-2", title: "防衛費が過去最大に", url: "https://example.com/2", source: "朝日新聞デジタル", publishedAt: now, matchedAt: now },
      { id: "item-3", title: "防衛費増額、野党反発", url: "https://example.com/3", source: "毎日新聞", publishedAt: now, matchedAt: now },
    ],
  },
  {
    id: "fg-002",
    title: "日経平均4万円突破",
    articleCount: 2,
    lastSeenAt: oneHourAgo,
    createdAt: twoHoursAgo,
    uniqueSourceCount: 2,
    singleOutlet: false,
    items: [
      { id: "item-4", title: "日経平均が節目の4万円を突破", url: "https://example.com/4", source: "日本経済新聞", publishedAt: oneHourAgo, matchedAt: oneHourAgo },
      { id: "item-5", title: "株価4万円の意味", url: "https://example.com/5", source: "東洋経済ONLINE", publishedAt: oneHourAgo, matchedAt: oneHourAgo },
    ],
  },
];

export const COMPARE_FIXTURE: NewsGroup[] = [
  {
    groupTitle: "防衛費増額の閣議決定",
    items: [
      { title: "防衛費増額決定", url: "https://example.com/1", source: "NHKニュース", publishedAt: now },
      { title: "防衛費が過去最大に", url: "https://example.com/2", source: "朝日新聞デジタル", publishedAt: now },
      { title: "防衛費増額、野党反発", url: "https://example.com/3", source: "毎日新聞", publishedAt: now },
    ],
    singleOutlet: false,
    category: "politics",
  },
];

// /api/analyze 用（home page マルチモデル形式: { model, result, index, total }）
export const HOME_ANALYZE_SSE_EVENTS = [
  {
    event: "model-result",
    data: {
      model: "gemma3:latest",
      result: {
        scores: { economic: 0.3, social: -0.2, diplomatic: -0.5 },
        emotionalTone: -0.1,
        biasWarning: false,
        summary: "防衛費増額が閣議決定された。",
        counterOpinion: "財政悪化につながるとの懸念もある。",
        confidence: 0.85,
      },
      index: 0,
      total: 1,
    },
  },
];

// /api/compare/analyze, /api/youtube/analyze 用（{ article: AnalyzedArticle } 形式）
export const COMPARE_ANALYZE_SSE_EVENTS = [
  {
    event: "article",
    data: {
      article: {
        title: "防衛費増額決定",
        url: "https://example.com/1",
        source: "NHKニュース",
        content: "防衛費増額の記事本文",
        publishedAt: now,
        analysis: {
          scores: { economic: 0.3, social: -0.2, diplomatic: -0.5 },
          emotionalTone: -0.1,
          biasWarning: false,
          summary: "防衛費増額が閣議決定された。",
          counterOpinion: "財政悪化につながるとの懸念もある。",
          confidence: 0.85,
        },
        analyzedAt: now,
      },
    },
  },
  {
    event: "done",
    data: { total: 1 },
  },
];

export const YOUTUBE_FEED_FIXTURE: RssFeedItem[] = [
  {
    title: "【解説】防衛費増額の問題点",
    url: "https://www.youtube.com/watch?v=test001",
    source: "テストチャンネルA",
    publishedAt: now,
    summary: "防衛費増額について解説します",
    imageUrl: "https://img.youtube.com/vi/test001/mqdefault.jpg",
  },
  {
    title: "日本経済の現状と課題",
    url: "https://www.youtube.com/watch?v=test002",
    source: "テストチャンネルB",
    publishedAt: oneHourAgo,
    summary: "日本経済について分析します",
    imageUrl: "https://img.youtube.com/vi/test002/mqdefault.jpg",
  },
];

export const INSPECT_DETAIL_FIXTURE: GroupInspectDetail = {
  snapshotId: "snap-001",
  groupId: "grp-001",
  groupTitle: "防衛費増額の閣議決定",
  category: "politics",
  subcategory: null,
  rank: 1,
  singleOutlet: false,
  coveredBy: ["NHK", "朝日"],
  silentMedia: ["読売"],
  articles: [
    {
      title: "防衛費増額決定",
      url: "https://example.com/1",
      source: "NHKニュース",
      publishedAt: now,
      category: "politics",
      subcategory: null,
      summary: "防衛費増額が閣議決定された。",
    },
    {
      title: "防衛費が過去最大に",
      url: "https://example.com/2",
      source: "朝日新聞デジタル",
      publishedAt: now,
      category: "politics",
      subcategory: null,
      summary: null,
    },
  ],
  summary: {
    totalArticles: 3,
    byCategory: { politics: 3 },
    issues: [],
  },
};
