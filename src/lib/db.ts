import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import type { AnalyzedArticle, NewsGroup, RssFeedItem } from "@/types";
import { DATABASE_URL } from "@/lib/config";

// PrismaClient レイジーシングルトン
// スキーマ変更後に prisma generate を実行した場合、dev サーバーの再起動が必要。
// （globalThis はHMR をまたいで保持されるため、古いインスタンスがキャッシュされ続ける）
const PRISMA_CACHE_KEY = "prisma_v7"; // スキーマ変更時にインクリメントする
const globalForPrisma = globalThis as unknown as Record<string, PrismaClient | undefined>;

function getPrisma(): PrismaClient {
  if (globalForPrisma[PRISMA_CACHE_KEY]) return globalForPrisma[PRISMA_CACHE_KEY]!;

  const adapter = new PrismaPg({ connectionString: DATABASE_URL });
  const client = new PrismaClient({ adapter });

  if (process.env.NODE_ENV !== "production") globalForPrisma[PRISMA_CACHE_KEY] = client;
  return client;
}

// 各関数内で getPrisma() を呼ぶことで遅延初期化する
// （直接 `prisma` をエクスポートすると import 時に初期化が走るため避ける）

// ── Article ────────────────────────────────────────────

/** 分析済み記事を保存し、埋め込みベクトルも非同期で更新 */
export async function saveArticle(
  article: AnalyzedArticle,
  embedding?: number[]
): Promise<string> {
  const { title, content, url, source, publishedAt, analysis, category, subcategory } = article;

  const saved = await getPrisma().article.create({
    data: {
      title,
      content: content.slice(0, 10000),
      url: url ?? null,
      source: source ?? null,
      publishedAt: publishedAt ?? null,
      category: category ?? null,
      subcategory: subcategory ?? null,
      economic:      analysis.scores.economic,
      social:        analysis.scores.social,
      diplomatic:    analysis.scores.diplomatic,
      emotionalTone: analysis.emotionalTone,
      biasWarning:   analysis.biasWarning,
      confidence:    analysis.confidence,
      summary:       analysis.summary,
      counterOpinion: analysis.counterOpinion,
    },
  });

  // 埋め込みベクトルがあれば生SQLで更新
  if (embedding && embedding.length > 0) {
    const vec = `[${embedding.join(",")}]`;
    await getPrisma().$executeRawUnsafe(
      `UPDATE articles SET embedding = $1::vector WHERE id = $2`,
      vec,
      saved.id
    );
  }

  return saved.id;
}

/** 最近の分析済み記事を取得（履歴表示用） */
export async function getRecentArticles(limit = 30): Promise<AnalyzedArticle[]> {
  const rows = await getPrisma().article.findMany({
    orderBy: { analyzedAt: "desc" },
    take: limit,
    select: {
      id: true,
      title: true,
      url: true,
      source: true,
      publishedAt: true,
      analyzedAt: true,
      category: true,
      subcategory: true,
      economic: true,
      social: true,
      diplomatic: true,
      emotionalTone: true,
      biasWarning: true,
      confidence: true,
      summary: true,
      counterOpinion: true,
    },
  });

  return rows.map(rowToAnalyzedArticle);
}

/** ベクトル類似検索（コサイン距離） */
export async function findSimilarArticles(
  embedding: number[],
  excludeId?: string,
  limit = 5
): Promise<Array<AnalyzedArticle & { similarity: number }>> {
  const vec = `[${embedding.join(",")}]`;
  const rows = await getPrisma().$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT id, title, url, source, published_at AS "publishedAt", analyzed_at AS "analyzedAt",
            economic, social, diplomatic,
            emotional_tone AS "emotionalTone", bias_warning AS "biasWarning", confidence, summary, counter_opinion AS "counterOpinion",
            1 - (embedding <=> $1::vector) AS similarity
     FROM articles
     WHERE embedding IS NOT NULL
       AND ($2::text IS NULL OR id != $2)
     ORDER BY embedding <=> $1::vector
     LIMIT $3`,
    vec,
    excludeId ?? null,
    limit
  );

  return rows.map((r) => ({
    ...rowToAnalyzedArticle(r),
    similarity: Number(r.similarity),
  }));
}

// ── CompareSession ─────────────────────────────────────

/** 比較セッション（keyword + groups）を保存 */
export async function saveCompareSession(
  keyword: string,
  groups: NewsGroup[]
): Promise<string> {
  const session = await getPrisma().compareSession.create({
    data: { keyword, groups: groups as unknown as object[] },
  });
  return session.id;
}

/** 比較分析結果を保存 */
export async function saveCompareResults(
  sessionId: string,
  results: AnalyzedArticle[],
  embeddings?: Record<number, number[]>
): Promise<void> {
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const row = await getPrisma().compareResult.create({
      data: {
        sessionId,
        title:          r.title,
        url:            r.url ?? null,
        source:         r.source ?? null,
        publishedAt:    r.publishedAt ?? null,
        economic:       r.analysis.scores.economic,
        social:         r.analysis.scores.social,
        diplomatic:     r.analysis.scores.diplomatic,
        emotionalTone:  r.analysis.emotionalTone,
        biasWarning:    r.analysis.biasWarning,
        confidence:     r.analysis.confidence,
        summary:        r.analysis.summary,
        counterOpinion: r.analysis.counterOpinion,
      },
    });

    if (embeddings?.[i]?.length) {
      const vec = `[${embeddings[i].join(",")}]`;
      await getPrisma().$executeRawUnsafe(
        `UPDATE compare_results SET embedding = $1::vector WHERE id = $2`,
        vec,
        row.id
      );
    }
  }
}

/** 最近の比較セッション履歴を取得 */
export async function getRecentCompareSessions(limit = 20) {
  return getPrisma().compareSession.findMany({
    orderBy: { savedAt: "desc" },
    take: limit,
    include: { results: { select: { source: true } } },
  });
}

// ── CompareGroupRecord ──────────────────────────────────

/** グループ化結果をベクトルとともに保存 */
export async function saveNewsGroupRecords(
  sessionId: string,
  groups: NewsGroup[],
  embeddings: Record<number, number[]>
): Promise<void> {
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const sources = [...new Set(g.items.map((item) => item.source).filter(Boolean))];

    const row = await getPrisma().compareGroupRecord.create({
      data: {
        sessionId,
        groupTitle:   g.groupTitle,
        singleOutlet: g.singleOutlet,
        itemCount:    g.items.length,
        sources:      sources,
      },
    });

    if (embeddings[i]?.length) {
      const vec = `[${embeddings[i].join(",")}]`;
      await getPrisma().$executeRawUnsafe(
        `UPDATE compare_group_records SET embedding = $1::vector WHERE id = $2`,
        vec,
        row.id
      );
    }
  }
}

export interface SimilarGroupResult {
  id:          string;
  sessionId:   string;
  groupTitle:  string;
  singleOutlet: boolean;
  itemCount:   number;
  sources:     string[];
  savedAt:     Date;
  similarity:  number;
}

/** ベクトル類似検索でグループを取得（コサイン距離） */
export async function findSimilarGroups(
  embedding: number[],
  limit = 5,
  excludeSessionId?: string
): Promise<SimilarGroupResult[]> {
  const vec = `[${embedding.join(",")}]`;
  const rows = await getPrisma().$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT id, session_id AS "sessionId", group_title AS "groupTitle", single_outlet AS "singleOutlet", item_count AS "itemCount", sources, saved_at AS "savedAt",
            1 - (embedding <=> $1::vector) AS similarity
     FROM compare_group_records
     WHERE embedding IS NOT NULL
       AND ($2::text IS NULL OR session_id != $2)
     ORDER BY embedding <=> $1::vector
     LIMIT $3`,
    vec,
    excludeSessionId ?? null,
    limit
  );

  return rows.map((r) => ({
    id:           String(r.id),
    sessionId:    String(r.sessionId),
    groupTitle:   String(r.groupTitle),
    singleOutlet: Boolean(r.singleOutlet),
    itemCount:    Number(r.itemCount),
    sources:      Array.isArray(r.sources) ? (r.sources as string[]) : [],
    savedAt:      r.savedAt instanceof Date ? r.savedAt : new Date(String(r.savedAt)),
    similarity:   Number(r.similarity),
  }));
}

// ── FeedGroup ───────────────────────────────────────────

export interface FeedGroupRecord {
  id:           string;
  title:        string;
  articleCount: number;
  embedding:    number[];
}

/** lastSeenAt 14日以内のアクティブなグループを取得（embedding必須） */
export async function getActiveFeedGroups(): Promise<FeedGroupRecord[]> {
  const rows = await getPrisma().$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT id, title, article_count AS "articleCount", embedding::text AS embedding_str
     FROM feed_groups
     WHERE last_seen_at > NOW() - INTERVAL '14 days'
       AND embedding IS NOT NULL`
  );
  return rows.flatMap((r) => {
    const vec = parseVectorString(r.embedding_str);
    if (!vec) return [];
    return [{
      id:           String(r.id),
      title:        String(r.title),
      articleCount: Number(r.articleCount),
      embedding:    vec,
    }];
  });
}

/** 新規 FeedGroup を作成し ID を返す */
export async function createFeedGroup(
  title: string,
  embedding: number[] | null
): Promise<string> {
  const row = await getPrisma().feedGroup.create({ data: { title } });
  if (embedding && embedding.length > 0) {
    await getPrisma().$executeRawUnsafe(
      `UPDATE feed_groups SET embedding = $1::vector WHERE id = $2`,
      `[${embedding.join(",")}]`,
      row.id
    );
  }
  return row.id;
}

/** centroid と articleCount、lastSeenAt を更新 */
export async function updateFeedGroupCentroid(
  id: string,
  embedding: number[],
  articleCount: number
): Promise<void> {
  await getPrisma().$executeRawUnsafe(
    `UPDATE feed_groups
     SET embedding = $1::vector, article_count = $2, last_seen_at = NOW()
     WHERE id = $3`,
    `[${embedding.join(",")}]`,
    articleCount,
    id
  );
}

/** FeedGroupItem を重複スキップで一括保存 */
export async function upsertFeedGroupItems(
  groupId: string,
  items: RssFeedItem[]
): Promise<void> {
  if (items.length === 0) return;
  await getPrisma().feedGroupItem.createMany({
    data: items.map((item) => ({
      groupId,
      title:       item.title,
      url:         item.url,
      source:      item.source,
      publishedAt: item.publishedAt ?? null,
    })),
    skipDuplicates: true,
  });
}

/** lastSeenAt 30日以上のグループを削除 */
export async function deleteStaleFeedGroups(): Promise<void> {
  await getPrisma().$executeRawUnsafe(
    `DELETE FROM feed_groups WHERE last_seen_at < NOW() - INTERVAL '30 days'`
  );
}

export interface FeedGroupWithItems {
  id:                string;
  title:             string;
  articleCount:      number;
  lastSeenAt:        string;
  createdAt:         string;
  uniqueSourceCount: number;
  singleOutlet:      boolean;
  items: Array<{
    id:          string;
    title:       string;
    url:         string;
    source:      string;
    publishedAt: string | null;
    matchedAt:   string;
  }>;
}

/** 点検用：アクティブなFeedGroupをitemsごと取得 */
export async function getFeedGroupsWithItems(limit = 200): Promise<FeedGroupWithItems[]> {
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const rows = await getPrisma().feedGroup.findMany({
    where: { lastSeenAt: { gte: cutoff } },
    orderBy: { articleCount: "desc" },
    take: limit,
    include: { items: { orderBy: { publishedAt: "desc" } } },
  });
  return rows.map((g) => {
    const uniqueSources = new Set(g.items.map((i) => i.source)).size;
    return {
      id:                g.id,
      title:             g.title,
      articleCount:      g.articleCount,
      lastSeenAt:        g.lastSeenAt.toISOString(),
      createdAt:         g.createdAt.toISOString(),
      uniqueSourceCount: uniqueSources,
      singleOutlet:      uniqueSources === 1,
      items: g.items.map((i) => ({
        id:          i.id,
        title:       i.title,
        url:         i.url,
        source:      i.source,
        publishedAt: i.publishedAt ?? null,
        matchedAt:   i.matchedAt.toISOString(),
      })),
    };
  });
}

// ── RssArticle ────────────────────────────────────────────

/** RSSから取得した記事を一括 upsert（URL重複はスキップ、topic/subcategoryのみ更新） */
export async function upsertRssArticles(items: RssFeedItem[]): Promise<void> {
  const valid = items.filter((item) => item.url);
  if (valid.length === 0) return;

  const CHUNK = 50;
  const prisma = getPrisma();

  for (let i = 0; i < valid.length; i += CHUNK) {
    const chunk = valid.slice(i, i + CHUNK);
    const params: unknown[] = [];
    const rows = chunk.map((item) => {
      const publishedAt = item.publishedAt ? new Date(item.publishedAt) : null;
      const validDate = publishedAt && !isNaN(publishedAt.getTime()) ? publishedAt : null;
      const offset = params.length;
      params.push(
        item.url, item.title, item.source,
        item.summary ?? null, item.imageUrl ?? null, validDate,
        item.category ?? null, item.subcategory ?? null,
      );
      return `(gen_random_uuid()::text, $${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, NOW())`;
    });

    await prisma.$executeRawUnsafe(
      `INSERT INTO rss_articles (id, url, title, source, summary, image_url, published_at, category, subcategory, fetched_at)
       VALUES ${rows.join(", ")}
       ON CONFLICT (url) DO UPDATE SET
         category    = COALESCE(EXCLUDED.category, rss_articles.category),
         subcategory = COALESCE(EXCLUDED.subcategory, rss_articles.subcategory),
         fetched_at  = NOW()`,
      ...params,
    );
  }
}

/** 指定日時以降に fetchedAt された記事を取得 */
export async function getRssArticlesSince(since: Date, sources?: string[]): Promise<RssFeedItem[]> {
  const hasSources = sources && sources.length > 0;
  const sql = hasSources
    ? `SELECT url, title, source, summary, image_url AS "imageUrl", published_at AS "publishedAt", category, subcategory
       FROM rss_articles
       WHERE fetched_at >= $1 AND source = ANY($2)
       ORDER BY published_at DESC NULLS LAST`
    : `SELECT url, title, source, summary, image_url AS "imageUrl", published_at AS "publishedAt", category, subcategory
       FROM rss_articles
       WHERE fetched_at >= $1
       ORDER BY published_at DESC NULLS LAST`;
  const rows = await getPrisma().$queryRawUnsafe<Array<Record<string, unknown>>>(
    sql,
    ...(hasSources ? [since, sources] : [since]),
  );
  return rows.map((r) => ({
    url:         String(r.url),
    title:       String(r.title),
    source:      String(r.source),
    summary:     r.summary != null ? String(r.summary) : undefined,
    imageUrl:    r.imageUrl != null ? String(r.imageUrl) : undefined,
    publishedAt: r.publishedAt instanceof Date ? r.publishedAt.toISOString() : r.publishedAt != null ? String(r.publishedAt) : undefined,
    category:    r.category != null ? String(r.category) : undefined,
    subcategory: r.subcategory != null ? String(r.subcategory) : undefined,
  }));
}

/** 指定期間内（since〜until）に publishedAt がある記事を取得 */
export async function getRssArticlesBetween(since: Date, until: Date, sources?: string[]): Promise<RssFeedItem[]> {
  const hasSources = sources && sources.length > 0;
  const sql = hasSources
    ? `SELECT url, title, source, summary, image_url AS "imageUrl", published_at AS "publishedAt", category, subcategory
       FROM rss_articles
       WHERE published_at >= $1 AND published_at <= $2 AND source = ANY($3)
       ORDER BY published_at DESC NULLS LAST`
    : `SELECT url, title, source, summary, image_url AS "imageUrl", published_at AS "publishedAt", category, subcategory
       FROM rss_articles
       WHERE published_at >= $1 AND published_at <= $2
       ORDER BY published_at DESC NULLS LAST`;
  const rows = await getPrisma().$queryRawUnsafe<Array<Record<string, unknown>>>(
    sql,
    ...(hasSources ? [since, until, sources] : [since, until]),
  );
  return rows.map((r) => ({
    url:         String(r.url),
    title:       String(r.title),
    source:      String(r.source),
    summary:     r.summary != null ? String(r.summary) : undefined,
    imageUrl:    r.imageUrl != null ? String(r.imageUrl) : undefined,
    publishedAt: r.publishedAt instanceof Date ? r.publishedAt.toISOString() : r.publishedAt != null ? String(r.publishedAt) : undefined,
    category:    r.category != null ? String(r.category) : undefined,
    subcategory: r.subcategory != null ? String(r.subcategory) : undefined,
  }));
}

// ── ProcessedSnapshot ─────────────────────────────────────

export interface GroupIssue {
  type: "cross_category_mismatch" | "no_category" | "subcategory_mismatch";
  severity: "low" | "medium" | "high";
  message: string;
}

export interface GroupInspectDetail {
  snapshotId:   string;
  groupId:      string;
  groupTitle:   string;
  category:     string | null;
  subcategory:  string | null;
  rank:         number;
  singleOutlet: boolean;
  coveredBy:    string[];
  silentMedia:  string[];
  articles: Array<{
    title:       string;
    url:         string;
    source:      string;
    publishedAt: string | null;
    category:    string | null;
    subcategory: string | null;
    summary:     string | null;
  }>;
  summary: {
    totalArticles: number;
    byCategory:    Record<string, number>;
    issues:        GroupIssue[];
  };
}

/** スナップショット内の特定グループを取得し、自動検出 issue を付与して返す */
export async function getSnapshotGroupDetail(
  snapshotId: string,
  groupId: string,
): Promise<GroupInspectDetail | null> {
  const group = await getPrisma().snapshotGroup.findFirst({
    where: { id: groupId, snapshotId },
    include: { items: { orderBy: [{ source: "asc" }, { publishedAt: "asc" }] } },
  });
  if (!group) return null;

  const articles = group.items.map((item) => ({
    title:       item.title,
    url:         item.url,
    source:      item.source,
    publishedAt: item.publishedAt ?? null,
    category:    item.category ?? null,
    subcategory: item.subcategory ?? null,
    summary:     item.summary ?? null,
  }));

  // カテゴリ集計
  const byCategory: Record<string, number> = {};
  for (const a of articles) {
    const cat = a.category ?? "(未分類)";
    byCategory[cat] = (byCategory[cat] ?? 0) + 1;
  }

  // Issue 検出（P2）
  const issues: GroupIssue[] = [];

  const cats = Object.keys(byCategory).filter((c) => c !== "(未分類)");
  if (cats.length >= 2) {
    issues.push({
      type:     "cross_category_mismatch",
      severity: "medium",
      message:  `カテゴリが${cats.length}種類混在 (${cats.join(", ")})`,
    });
  }

  if (!group.category) {
    issues.push({
      type:     "no_category",
      severity: "low",
      message:  "グループカテゴリが未設定",
    });
  }

  const subcats = new Set(articles.map((a) => a.subcategory).filter(Boolean));
  if (subcats.size >= 3) {
    issues.push({
      type:     "subcategory_mismatch",
      severity: "low",
      message:  `サブカテゴリが${subcats.size}種類混在`,
    });
  }

  return {
    snapshotId,
    groupId:      group.id,
    groupTitle:   group.groupTitle,
    category:     group.category ?? null,
    subcategory:  group.subcategory ?? null,
    rank:         group.rank,
    singleOutlet: group.singleOutlet,
    coveredBy:    Array.isArray(group.coveredBy)  ? (group.coveredBy  as string[]) : [],
    silentMedia:  Array.isArray(group.silentMedia) ? (group.silentMedia as string[]) : [],
    articles,
    summary: { totalArticles: articles.length, byCategory, issues },
  };
}

export interface SnapshotMeta {
  id:           string;
  processedAt:  string;
  articleCount: number;
  groupCount:   number;
  durationMs:   number;
  status:       string;
  error:        string | null;
}

export interface SnapshotResult {
  snapshot: SnapshotMeta | null;
  groups:   NewsGroup[];
}

/** 最新スナップショットを取得（グループ・記事含む） */
export async function getLatestSnapshot(): Promise<SnapshotResult> {
  const prisma = getPrisma();
  const snap = await prisma.processedSnapshot.findFirst({
    orderBy: { processedAt: "desc" },
    where: { status: { in: ["success", "partial"] } },
    include: {
      groups: {
        orderBy: { rank: "asc" },
        include: { items: true },
      },
    },
  });

  if (!snap) return { snapshot: null, groups: [] };

  const groups: NewsGroup[] = snap.groups.map((g) => ({
    id:           g.id,
    groupTitle:   g.groupTitle,
    singleOutlet: g.singleOutlet,
    category:     g.category ?? undefined,
    subcategory:  g.subcategory ?? undefined,
    rank:         g.rank,
    coveredBy:    Array.isArray(g.coveredBy)   ? (g.coveredBy   as string[]) : [],
    silentMedia:  Array.isArray(g.silentMedia) ? (g.silentMedia as string[]) : [],
    items: g.items.map((item) => ({
      title:       item.title,
      url:         item.url,
      source:      item.source,
      summary:     item.summary ?? undefined,
      publishedAt: item.publishedAt ?? undefined,
      category:    item.category ?? undefined,
      subcategory: item.subcategory ?? undefined,
    })),
  }));

  return {
    snapshot: {
      id:           snap.id,
      processedAt:  snap.processedAt.toISOString(),
      articleCount: snap.articleCount,
      groupCount:   snap.groupCount,
      durationMs:   snap.durationMs,
      status:       snap.status,
      error:        snap.error ?? null,
    },
    groups,
  };
}

/** スナップショット履歴一覧（グループなし） */
export async function getSnapshotHistory(limit = 20): Promise<SnapshotMeta[]> {
  const rows = await getPrisma().processedSnapshot.findMany({
    orderBy: { processedAt: "desc" },
    take: limit,
    select: {
      id: true,
      processedAt: true,
      articleCount: true,
      groupCount: true,
      durationMs: true,
      status: true,
      error: true,
    },
  });
  return rows.map((r) => ({
    ...r,
    processedAt: r.processedAt.toISOString(),
    error: r.error ?? null,
  }));
}

/** 3ヶ月以上前の記事を削除 */
export async function deleteStaleRssArticles(): Promise<void> {
  await getPrisma().$executeRawUnsafe(
    `DELETE FROM rss_articles WHERE fetched_at < NOW() - INTERVAL '3 months'`
  );
}

// ── YouTubeVideo ─────────────────────────────────────────

export interface YouTubeVideoSaveInput {
  videoId:       string;
  title:         string;
  channelName:   string;
  channelId:     string;
  description?:  string;
  thumbnailUrl?: string;
  publishedAt?:  string;
  transcript:    string;
  transcriptType: "transcript" | "description";
  economic:      number;
  social:        number;
  diplomatic:    number;
  emotionalTone: number;
  biasWarning:   boolean;
  confidence:    number;
  summary:       string;
  counterOpinion: string;
  category?:     string;
  subcategory?:  string;
}

/** YouTube 動画分析結果を保存（既存なら更新） */
export async function saveYouTubeVideo(
  input: YouTubeVideoSaveInput,
  embedding?: number[]
): Promise<string> {
  const saved = await getPrisma().youTubeVideo.upsert({
    where: { videoId: input.videoId },
    create: input,
    update: {
      ...input,
      analyzedAt: new Date(),
    },
  });

  if (embedding && embedding.length > 0) {
    await getPrisma().$executeRawUnsafe(
      `UPDATE youtube_videos SET embedding = $1::vector WHERE id = $2`,
      `[${embedding.join(",")}]`,
      saved.id
    );
  }

  return saved.id;
}

/** RssArticle の embedding を一括更新（url をキーに） */
export async function saveRssArticleEmbeddings(
  entries: { url: string; vec: number[] }[]
): Promise<void> {
  if (entries.length === 0) return;
  const prisma = getPrisma();
  await Promise.all(
    entries.map(({ url, vec }) =>
      prisma.$executeRawUnsafe(
        `UPDATE rss_articles SET embedding = $1::vector WHERE url = $2`,
        `[${vec.join(",")}]`,
        url,
      ).catch(() => {})
    )
  );
}

export interface SnapshotGroupSummary {
  id:       string;
  title:    string;
  category: string | null;
  items: Array<{ url: string; title: string; source: string; category: string | null }>;
}

/** スナップショット内の全グループとアイテムを返す（再計算診断用） */
export async function getSnapshotGroupsForRecompute(
  snapshotId: string,
): Promise<SnapshotGroupSummary[]> {
  const groups = await getPrisma().snapshotGroup.findMany({
    where: { snapshotId },
    orderBy: { rank: "asc" },
    include: { items: { select: { url: true, title: true, source: true, category: true } } },
  });
  return groups.map((g) => ({
    id:       g.id,
    title:    g.groupTitle,
    category: g.category ?? null,
    items:    g.items,
  }));
}

/** 指定URLの embedding を取得して Map<url, number[]> で返す */
export async function getRssArticleEmbeddingMap(
  urls: string[]
): Promise<Map<string, number[]>> {
  if (urls.length === 0) return new Map();
  const rows = await getPrisma().$queryRawUnsafe<Array<{ url: string; embedding_str: string }>>(
    `SELECT url, embedding::text AS embedding_str
     FROM rss_articles
     WHERE url = ANY($1) AND embedding IS NOT NULL`,
    urls,
  );
  const map = new Map<string, number[]>();
  for (const r of rows) {
    const vec = parseVectorString(r.embedding_str);
    if (vec) map.set(r.url, vec);
  }
  return map;
}

// ── ヘルパー ────────────────────────────────────────────

function parseVectorString(s: unknown): number[] | null {
  if (typeof s !== "string") return null;
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) return parsed.map(Number);
    return null;
  } catch {
    return null;
  }
}

function rowToAnalyzedArticle(r: Record<string, unknown>): AnalyzedArticle {
  return {
    title:       String(r.title ?? ""),
    content:     "",
    url:         r.url ? String(r.url) : undefined,
    source:      r.source ? String(r.source) : undefined,
    publishedAt: r.publishedAt ? String(r.publishedAt) : undefined,
    analysis: {
      scores: {
        economic:   Number(r.economic),
        social:     Number(r.social),
        diplomatic: Number(r.diplomatic),
      },
      emotionalTone:  Number(r.emotionalTone),
      biasWarning:    Boolean(r.biasWarning),
      confidence:     Number(r.confidence),
      summary:        String(r.summary ?? ""),
      counterOpinion: String(r.counterOpinion ?? ""),
    },
    analyzedAt: r.analyzedAt instanceof Date
      ? r.analyzedAt.toISOString()
      : String(r.analyzedAt ?? new Date().toISOString()),
    category:    r.category    ? String(r.category)    : undefined,
    subcategory: r.subcategory ? String(r.subcategory) : undefined,
  };
}
