import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import type { AnalyzedArticle, NewsGroup } from "@/types";

// PrismaClient レイジーシングルトン
// スキーマ変更後に prisma generate を実行した場合、dev サーバーの再起動が必要。
// （globalThis はHMR をまたいで保持されるため、古いインスタンスがキャッシュされ続ける）
const PRISMA_CACHE_KEY = "prisma_v3"; // スキーマ変更時にインクリメントする
const globalForPrisma = globalThis as unknown as Record<string, PrismaClient | undefined>;

function getPrisma(): PrismaClient {
  if (globalForPrisma[PRISMA_CACHE_KEY]) return globalForPrisma[PRISMA_CACHE_KEY]!;

  const adapter = new PrismaPg({
    connectionString:
      process.env.DATABASE_URL ??
      "postgresql://newsprism:newsprism@localhost:5432/newsprism",
  });
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
  const { title, content, url, source, publishedAt, analysis } = article;

  const saved = await getPrisma().article.create({
    data: {
      title,
      content: content.slice(0, 10000),
      url: url ?? null,
      source: source ?? null,
      publishedAt: publishedAt ?? null,
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

// ── ヘルパー ────────────────────────────────────────────

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
  };
}
