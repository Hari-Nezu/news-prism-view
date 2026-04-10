import { NextRequest, NextResponse } from "next/server";
import {
  getSnapshotGroupsForRecompute,
  getRssArticleEmbeddingMap,
} from "@/lib/db";

const UNKNOWN_CATEGORY_OFFSET = 0.05;
const DEFAULT_THRESHOLD = 0.87;

function isUnknownCategory(cat: string | null): boolean {
  return !cat || cat === "other";
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function meanVector(vectors: number[][]): number[] | null {
  if (vectors.length === 0) return null;
  const dim = vectors[0].length;
  const result = new Array<number>(dim).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < dim; i++) result[i] += v[i];
  }
  for (let i = 0; i < dim; i++) result[i] /= vectors.length;
  return result;
}

export async function POST(req: NextRequest) {
  let body: { snapshotId?: string; groupId?: string; threshold?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストボディ" }, { status: 400 });
  }

  const { snapshotId, groupId, threshold = DEFAULT_THRESHOLD } = body;
  if (!snapshotId || !groupId) {
    return NextResponse.json({ error: "snapshotId と groupId は必須" }, { status: 400 });
  }

  try {
    const allGroups = await getSnapshotGroupsForRecompute(snapshotId);
    const targetGroup = allGroups.find((g) => g.id === groupId);
    if (!targetGroup) {
      return NextResponse.json({ error: "グループが見つかりません" }, { status: 404 });
    }

    // 全スナップショット内の URL を収集して embedding を一括取得
    const allUrls = allGroups.flatMap((g) => g.items.map((i) => i.url));
    const embeddingMap = await getRssArticleEmbeddingMap(allUrls);

    // 各グループの centroid を計算
    const groupCentroids = new Map<string, number[] | null>();
    for (const g of allGroups) {
      const vecs = g.items.flatMap((i) => {
        const e = embeddingMap.get(i.url);
        return e ? [e] : [];
      });
      groupCentroids.set(g.id, meanVector(vecs));
    }

    const targetCentroid = groupCentroids.get(groupId) ?? null;

    // 対象グループ外の全記事（nearest neighbor 用）
    const otherArticles = allGroups
      .filter((g) => g.id !== groupId)
      .flatMap((g) =>
        g.items.map((i) => ({ ...i, groupId: g.id, groupTitle: g.title }))
      );
    const sameGroupArticles = targetGroup.items.map((i) => ({
      ...i,
      groupId,
      groupTitle: targetGroup.title,
    }));
    const allArticlesFlat = [...sameGroupArticles, ...otherArticles];

    // 対象外グループ（代替クラスタ候補）
    const otherGroups = allGroups.filter((g) => g.id !== groupId);

    // 各記事の診断を計算
    const articles = targetGroup.items.map((item) => {
      const emb = embeddingMap.get(item.url) ?? null;
      const unknown = isUnknownCategory(item.category);
      const effectiveOffset = unknown ? UNKNOWN_CATEGORY_OFFSET : 0;

      let similarityToCentroid: number | null = null;
      let similarityBeforePenalty: number | null = null;
      let similarityAfterPenalty: number | null = null;

      if (emb && targetCentroid) {
        const raw = cosineSimilarity(emb, targetCentroid);
        similarityToCentroid    = raw;
        similarityBeforePenalty = raw;
        similarityAfterPenalty  = raw - effectiveOffset;
      }

      // Nearest neighbors（embedding がある全記事から自分以外の上位5件）
      const nearestNeighbors = emb
        ? allArticlesFlat
            .filter((a) => a.url !== item.url)
            .flatMap((a) => {
              const ae = embeddingMap.get(a.url);
              if (!ae) return [];
              return [{ url: a.url, title: a.title, source: a.source, groupId: a.groupId, groupTitle: a.groupTitle, similarity: cosineSimilarity(emb, ae) }];
            })
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, 5)
        : [];

      // Alternative clusters（他グループへの centroid 類似度、上位3件）
      const alternativeClusters = emb
        ? otherGroups
            .flatMap((g) => {
              const c = groupCentroids.get(g.id);
              if (!c) return [];
              return [{ groupId: g.id, groupTitle: g.title, category: g.category, similarity: cosineSimilarity(emb, c) }];
            })
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, 3)
        : [];

      return {
        url:                    item.url,
        title:                  item.title,
        source:                 item.source,
        category:               item.category,
        hasEmbedding:           emb !== null,
        isUnknownCategory:      unknown,
        similarityToCentroid,
        similarityBeforePenalty,
        similarityAfterPenalty,
        wouldJoinAtThreshold:   similarityAfterPenalty !== null
          ? similarityAfterPenalty > threshold
          : null,
        nearestNeighbors,
        alternativeClusters,
      };
    });

    // 閾値シミュレーション
    const articlesWithEmb = articles.filter((a) => a.similarityAfterPenalty !== null);
    const thresholdSimulation = {
      threshold,
      wouldStay:   articlesWithEmb.filter((a) => a.wouldJoinAtThreshold === true).length,
      wouldLeave:  articlesWithEmb.filter((a) => a.wouldJoinAtThreshold === false).length,
      noEmbedding: articles.filter((a) => !a.hasEmbedding).length,
    };

    return NextResponse.json({
      snapshotId,
      groupId,
      groupTitle:          targetGroup.title,
      groupCategory:       targetGroup.category,
      hasCentroid:         targetCentroid !== null,
      articles,
      thresholdSimulation,
    });
  } catch (e) {
    console.error("[inspect/recompute]", e);
    return NextResponse.json({ error: "再計算失敗" }, { status: 500 });
  }
}
