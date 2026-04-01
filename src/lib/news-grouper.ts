import { z } from "zod";
import type { RssFeedItem, NewsGroup } from "@/types";
import { embedBatch, cosineSimilarity } from "@/lib/embeddings";
import {
  getActiveFeedGroups,
  createFeedGroup,
  updateFeedGroupCentroid,
  upsertFeedGroupItems,
  deleteStaleFeedGroups,
  type FeedGroupRecord,
} from "@/lib/db";

import { OLLAMA_BASE_URL, OLLAMA_MODEL, GROUP_CLUSTER_THRESHOLD, FEED_GROUP_SIMILARITY_THRESHOLD } from "@/lib/config";

const NamingSchema = z.object({
  groups: z.array(
    z.object({
      index: z.number().int(),
      title: z.string(),
    })
  ),
});

/**
 * クラスタ群に日本語タイトルをつける（LLMの役割はここだけ）
 * 失敗時は各クラスタの先頭タイトルをそのまま使う
 */
async function nameGroupClusters(clusters: RssFeedItem[][]): Promise<string[]> {
  const clusterList = clusters
    .map((items, i) => `グループ${i}: ${items.map((item) => `「${item.title}」`).join(" ")}`)
    .join("\n");

  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        system: `各グループに20字以内の簡潔な日本語タイトルをつけてください。必ずJSON形式のみで回答してください。
出力フォーマット: { "groups": [{ "index": 0, "title": "タイトル" }, ...] }`,
        prompt: clusterList,
        stream: false,
        format: "json",
        options: { temperature: 0.1 },
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) throw new Error(`Ollama ${res.status}`);

    const data     = await res.json();
    const parsed   = NamingSchema.parse(JSON.parse(data.response));
    const titleMap = new Map(parsed.groups.map((g) => [g.index, g.title]));
    return clusters.map((items, i) => titleMap.get(i) ?? items[0].title.slice(0, 20));
  } catch {
    return clusters.map((items) => items[0].title.slice(0, 20));
  }
}

/**
 * 複数記事を同一ニュースごとにグループ化する
 * - Embedding コサイン類似度クラスタリングでグループを構成
 * - LLM はグループ命名のみに使用（精度向上 + 高速化）
 * - Embedding 失敗時はタイトル先頭をグループ名として返す
 */
export async function groupArticlesByEvent(
  items: RssFeedItem[]
): Promise<NewsGroup[]> {
  if (items.length === 0) return [];

  const targets = items.slice(0, 30);
  const vecs    = await embedBatch(targets.map((i) => i.title));

  // Greedy クラスタリング: 類似度が閾値以上の最近傍クラスタに追加
  type Cluster = { centroid: number[]; items: RssFeedItem[]; vecs: number[][] };
  const clusters: Cluster[] = [];

  for (let i = 0; i < targets.length; i++) {
    const vec = vecs[i];
    if (!vec) {
      // embedding 失敗 → 単独クラスタとして追加（タイトルをそのまま使用）
      clusters.push({ centroid: [], items: [targets[i]], vecs: [] });
      continue;
    }

    let bestCluster: Cluster | null = null;
    let bestSim = GROUP_CLUSTER_THRESHOLD;

    for (const cluster of clusters) {
      if (cluster.centroid.length === 0) continue;
      const sim = cosineSimilarity(vec, cluster.centroid);
      if (sim > bestSim) { bestSim = sim; bestCluster = cluster; }
    }

    if (bestCluster) {
      bestCluster.items.push(targets[i]);
      bestCluster.vecs.push(vec);
      bestCluster.centroid = meanVec(bestCluster.vecs);
    } else {
      clusters.push({ centroid: vec, items: [targets[i]], vecs: [vec] });
    }
  }

  // LLM でクラスタに命名
  const titles = await nameGroupClusters(clusters.map((c) => c.items));

  const groups: NewsGroup[] = clusters.map((cluster, i) => ({
    groupTitle:   titles[i],
    items:        cluster.items,
    singleOutlet: new Set(cluster.items.map((item) => item.source)).size <= 1,
  }));

  groups.sort((a, b) => {
    if (a.singleOutlet !== b.singleOutlet) return a.singleOutlet ? 1 : -1;
    return b.items.length - a.items.length;
  });

  return groups;
}

// ── インクリメンタルグループ化 ──────────────────────────

const TIME_WINDOW_MS  = 7  * 24 * 60 * 60 * 1000;
const MAX_GROUP_SIZE  = 20;

/**
 * DBのFeedGroupを再利用しながらグループ化する。
 * - 既存グループに類似する記事はembedding検索でマッチ（Ollama不要）
 * - マッチしない記事だけOllamaに送り新規グループ作成
 */
export async function incrementalGroupArticles(
  items: RssFeedItem[]
): Promise<NewsGroup[]> {
  if (items.length === 0) return [];

  const threshold = FEED_GROUP_SIMILARITY_THRESHOLD;

  // 時間窓フィルタ（古すぎる記事は除外）
  const recent = items.filter((item) => {
    if (!item.publishedAt) return true;
    return Date.now() - new Date(item.publishedAt).getTime() <= TIME_WINDOW_MS;
  });
  if (recent.length === 0) return [];

  // 1. 全記事タイトルをバッチembed + 古いグループ削除（並行）
  const [itemVecs] = await Promise.all([
    embedBatch(recent.map((i) => i.title)),
    deleteStaleFeedGroups().catch(() => {}),
  ]);

  // 2. アクティブなFeedGroupをDBから取得（テーブル未作成時は空配列にフォールバック）
  const existingGroups = await getActiveFeedGroups().catch((err) => {
    console.warn("[incrementalGroup] FeedGroup取得失敗（prisma db push が必要な可能性）:", err?.message);
    return [];
  });

  // 3. 各記事を既存グループにマッチ or 未マッチに振り分け
  const unmatched:     RssFeedItem[]       = [];
  const unmatchedVecs: (number[] | null)[] = [];
  const assignments    = new Map<string, {
    group: FeedGroupRecord;
    items: RssFeedItem[];
    vecs:  number[][];
  }>();

  for (let i = 0; i < recent.length; i++) {
    const item = recent[i];
    const vec  = itemVecs[i];

    if (!vec || existingGroups.length === 0) {
      unmatched.push(item);
      unmatchedVecs.push(vec);
      continue;
    }

    let bestSim = 0;
    let bestGroup: FeedGroupRecord | null = null;
    for (const g of existingGroups) {
      if (g.articleCount >= MAX_GROUP_SIZE) continue;
      const sim = cosineSimilarity(vec, g.embedding);
      if (sim > bestSim) { bestSim = sim; bestGroup = g; }
    }

    if (bestSim >= threshold && bestGroup) {
      const entry = assignments.get(bestGroup.id);
      if (entry) {
        entry.items.push(item);
        entry.vecs.push(vec);
      } else {
        assignments.set(bestGroup.id, { group: bestGroup, items: [item], vecs: [vec] });
      }
    } else {
      unmatched.push(item);
      unmatchedVecs.push(vec);
    }
  }

  // 4. マッチしたグループのcentroid更新 & FeedGroupItem保存
  const matchedGroups: NewsGroup[] = [];
  for (const [groupId, { group, items: assigned, vecs }] of assignments) {
    const newCentroid = computeNewCentroid(group.embedding, group.articleCount, vecs);
    await Promise.all([
      updateFeedGroupCentroid(groupId, newCentroid, group.articleCount + vecs.length).catch(() => {}),
      upsertFeedGroupItems(groupId, assigned).catch(() => {}),
    ]);
    matchedGroups.push({
      groupTitle:   group.title,
      items:        assigned,
      singleOutlet: new Set(assigned.map((i) => i.source)).size <= 1,
    });
  }

  // 5. 未マッチ記事をOllamaで新規グループ化
  let newGroups: NewsGroup[] = [];
  if (unmatched.length > 0) {
    newGroups = await groupArticlesByEvent(unmatched);

    // 新グループをDBに保存（ノンブロッキング）
    Promise.all(
      newGroups.map(async (ng) => {
        const ngVecs = ng.items.flatMap((ngItem) => {
          const idx = unmatched.findIndex((u) => u.url === ngItem.url);
          return idx >= 0 && unmatchedVecs[idx] ? [unmatchedVecs[idx]!] : [];
        });
        const centroid = ngVecs.length > 0 ? meanVec(ngVecs) : null;
        const groupId  = await createFeedGroup(ng.groupTitle, centroid);
        await upsertFeedGroupItems(groupId, ng.items);
      })
    ).catch((err) => console.error("[incrementalGroup] DB保存エラー:", err));
  }

  return [...matchedGroups, ...newGroups];
}

// ── ベクトル演算ヘルパー ─────────────────────────────────

function meanVec(vecs: number[][]): number[] {
  const dim    = vecs[0].length;
  const result = new Array<number>(dim).fill(0);
  for (const v of vecs) {
    for (let i = 0; i < dim; i++) result[i] += v[i];
  }
  return result.map((x) => x / vecs.length);
}

function computeNewCentroid(
  old: number[],
  n:   number,
  newVecs: number[][]
): number[] {
  if (newVecs.length === 0) return old;
  const k   = newVecs.length;
  const dim = old.length;
  return Array.from({ length: dim }, (_, i) => {
    let sum = old[i] * n;
    for (const v of newVecs) sum += v[i];
    return sum / (n + k);
  });
}
