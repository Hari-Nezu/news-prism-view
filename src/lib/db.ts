import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import type { AnalyzedArticle, NewsGroup, RssFeedItem } from "@/types";
import { DATABASE_URL } from "@/lib/config";

// PrismaClient レイジーシングルトン
// スキーマ変更後に prisma generate を実行した場合、dev サーバーの再起動が必要。
// （globalThis はHMR をまたいで保持されるため、古いインスタンスがキャッシュされ続ける）
const PRISMA_CACHE_KEY = "prisma_v6"; // スキーマ変更時にインクリメントする
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
  const { title, content, url, source, publishedAt, analysis, topic, subcategory } = article;

  const saved = await getPrisma().article.create({
    data: {
      title,
      content: content.slice(0, 10000),
      url: url ?? null,
      source: source ?? null,
      publishedAt: publishedAt ?? null,
      topic: topic ?? null,
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
      `UPDATE "Article" SET embedding = $1::vector WHERE id = $2`,
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
      topic: true,
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
    `SELECT id, title, url, source, "publishedAt", "analyzedAt",
            economic, social, diplomatic,
            "emotionalTone", "biasWarning", confidence, summary, "counterOpinion",
            1 - (embedding <=> $1::vector) AS similarity
     FROM "Article"
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
        `UPDATE "CompareResult" SET embedding = $1::vector WHERE id = $2`,
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
        `UPDATE "CompareGroupRecord" SET embedding = $1::vector WHERE id = $2`,
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
    `SELECT id, "sessionId", "groupTitle", "singleOutlet", "itemCount", sources, "savedAt",
            1 - (embedding <=> $1::vector) AS similarity
     FROM "CompareGroupRecord"
     WHERE embedding IS NOT NULL
       AND ($2::text IS NULL OR "sessionId" != $2)
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
    `SELECT id, title, "articleCount", embedding::text AS embedding_str
     FROM "FeedGroup"
     WHERE "lastSeenAt" > NOW() - INTERVAL '14 days'
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
      `UPDATE "FeedGroup" SET embedding = $1::vector WHERE id = $2`,
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
    `UPDATE "FeedGroup"
     SET embedding = $1::vector, "articleCount" = $2, "lastSeenAt" = NOW()
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
    `DELETE FROM "FeedGroup" WHERE "lastSeenAt" < NOW() - INTERVAL '30 days'`
  );
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
        item.topic ?? null, item.subcategory ?? null,
      );
      return `(gen_random_uuid()::text, $${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, NOW())`;
    });

    await prisma.$executeRawUnsafe(
      `INSERT INTO "RssArticle" (id, url, title, source, summary, "imageUrl", "publishedAt", topic, subcategory, "fetchedAt")
       VALUES ${rows.join(", ")}
       ON CONFLICT (url) DO UPDATE SET
         topic       = COALESCE(EXCLUDED.topic, "RssArticle".topic),
         subcategory = COALESCE(EXCLUDED.subcategory, "RssArticle".subcategory),
         "fetchedAt" = NOW()`,
      ...params,
    );
  }
}

/** 指定日時以降に fetchedAt された記事を取得 */
export async function getRssArticlesSince(since: Date): Promise<RssFeedItem[]> {
  const rows = await getPrisma().$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT url, title, source, summary, "imageUrl", "publishedAt", topic, subcategory
     FROM "RssArticle"
     WHERE "fetchedAt" >= $1
     ORDER BY "publishedAt" DESC NULLS LAST`,
    since,
  );
  return rows.map((r) => ({
    url:         String(r.url),
    title:       String(r.title),
    source:      String(r.source),
    summary:     r.summary != null ? String(r.summary) : undefined,
    imageUrl:    r.imageUrl != null ? String(r.imageUrl) : undefined,
    publishedAt: r.publishedAt instanceof Date ? r.publishedAt.toISOString() : r.publishedAt != null ? String(r.publishedAt) : undefined,
    topic:       r.topic != null ? String(r.topic) : undefined,
    subcategory: r.subcategory != null ? String(r.subcategory) : undefined,
  }));
}

/** 3ヶ月以上前の記事を削除 */
export async function deleteStaleRssArticles(): Promise<void> {
  await getPrisma().$executeRawUnsafe(
    `DELETE FROM "RssArticle" WHERE "fetchedAt" < NOW() - INTERVAL '3 months'`
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
  topic?:        string;
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
      `UPDATE "YouTubeVideo" SET embedding = $1::vector WHERE id = $2`,
      `[${embedding.join(",")}]`,
      saved.id
    );
  }

  return saved.id;
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
    topic:       r.topic       ? String(r.topic)       : undefined,
    subcategory: r.subcategory ? String(r.subcategory) : undefined,
  };
}
