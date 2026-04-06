import { z } from "zod";
import type { RssFeedItem, NewsGroup } from "@/types";
import { embedBatch, cosineSimilarity } from "@/lib/embeddings";
import {
  getActiveFeedGroups,
  createFeedGroup,
  updateFeedGroupCentroid,
  upsertFeedGroupItems,
  deleteStaleFeedGroups,
  getRssArticleEmbeddingMap,
  type FeedGroupRecord,
} from "@/lib/db";

import { LLM_BASE_URL, LLM_MODEL, GROUP_CLUSTER_THRESHOLD, FEED_GROUP_SIMILARITY_THRESHOLD } from "@/lib/config";

const NamingSchema = z.object({
  groups: z.array(
    z.object({
      index: z.number().int(),
      title: z.string(),
    })
  ),
});

/**
 * 全記事タイトルに共通して出現するキーワードを抽出する。
 * LLMへのヒントとして使用し、共通テーマの命名精度を上げる。
 */
function extractCommonKeywords(items: RssFeedItem[]): string[] {
  if (items.length <= 1) return [];
  const threshold = Math.max(2, Math.ceil(items.length * 0.5)); // 過半数以上に出現
  const tokenSets = items.map((item) =>
    new Set(
      item.title
        .replace(/[「」『』（）()\[\]【】、。・＝=→←↑↓]/g, " ")
        .split(/[\s　]+/)
        .filter((w) => w.length >= 2)
    )
  );
  const freq = new Map<string, number>();
  for (const tokens of tokenSets) {
    for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1);
  }
  return [...freq.entries()]
    .filter(([, c]) => c >= threshold)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([w]) => w);
}

/**
 * クラスタ群に日本語タイトルをつける（LLMの役割はここだけ）
 * 失敗時は各クラスタの共通ワードから構成する
 */
async function nameGroupClusters(clusters: RssFeedItem[][]): Promise<string[]> {
  const clusterList = clusters
    .map((items, i) => {
      const cat = dominantCategory(items);
      const sub = dominantSubcategory(items);
      const context = (sub && sub !== "other") ? `${cat} > ${sub}` : cat;
      const common = extractCommonKeywords(items);
      const commonLine = common.length > 0 ? `\n  共通キーワード: ${common.join("・")}` : "";
      const titles = items.map((item) => `「${item.title}」`).join(" ");
      return `グループ${i}（${context}）${commonLine}\n  記事: ${titles}`;
    })
    .join("\n\n");

  try {
    const res = await fetch(`${LLM_BASE_URL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [
          {
            role: "system",
            content: `各グループの「全記事」が共通して報じている出来事を、20字以内の自然な日本語で命名してください。

命名スタイル:
- 体言止め（名詞句）を基本とする。例:「日銀の利上げ決定」「トランプ関税と円安」「能登地震の復興状況」
- 述語（〜した・〜される）で終わらせない
- 助詞・助動詞を最小限にして読みやすくする
- 固有名詞（人名・地名・組織名）は積極的に使う

制約:
- 「共通キーワード」に示した語を中心に命名する
- グループ内の一部の記事にしか当てはまらない内容は含めない
- 特定の記事タイトルをそのままコピーしない

必ずJSON形式のみで回答してください。
出力フォーマット: { "groups": [{ "index": 0, "title": "タイトル" }, ...] }`,
          },
          { role: "user", content: clusterList },
        ],
        stream:          false,
        response_format: { type: "json_object" },
        temperature:     0.1,
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) throw new Error(`llama.cpp ${res.status}`);

    const data     = await res.json();
    const parsed   = NamingSchema.parse(JSON.parse(data.choices[0].message.content));
    const titleMap = new Map(parsed.groups.map((g) => [g.index, g.title]));
    return clusters.map((items, i) => titleMap.get(i) ?? fallbackTitle(items));
  } catch {
    return clusters.map((items) => fallbackTitle(items));
  }
}

/** LLM失敗時のフォールバック: 全記事共通キーワードを結合、なければ先頭記事を切り取り */
function fallbackTitle(items: RssFeedItem[]): string {
  const common = extractCommonKeywords(items);
  if (common.length > 0) return common.join(" ").slice(0, 30);
  return items[0].title.slice(0, 30);
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
  const vecs    = await embedBatch(targets.map((i) => i.summary ? `${i.title}\n${i.summary.slice(0, 200)}` : i.title));

  // Greedy クラスタリング: 類似度が閾値以上の最近傍クラスタに追加
  // 異カテゴリ間はコサイン類似度を30%減衰させる（ソフトフィルタ）
  type Cluster = { centroid: number[]; items: RssFeedItem[]; vecs: number[][]; dominantCat: string };
  const clusters: Cluster[] = [];

  for (let i = 0; i < targets.length; i++) {
    const vec  = vecs[i];
    const item = targets[i];
    if (!vec) {
      // embedding 失敗 → 単独クラスタとして追加（タイトルをそのまま使用）
      clusters.push({ centroid: [], items: [item], vecs: [], dominantCat: item.category ?? "other" });
      continue;
    }

    let bestCluster: Cluster | null = null;
    let bestSim = GROUP_CLUSTER_THRESHOLD;

    for (const cluster of clusters) {
      if (cluster.centroid.length === 0) continue;
      const rawSim = cosineSimilarity(vec, cluster.centroid);
      // カテゴリが判明している場合のみ減衰。"other" 同士は減衰しない
      const catMismatch =
        item.category && item.category !== "other" &&
        cluster.dominantCat !== "other" &&
        item.category !== cluster.dominantCat;
      const sim = catMismatch ? rawSim * 0.7 : rawSim;
      if (sim > bestSim) { bestSim = sim; bestCluster = cluster; }
    }

    if (bestCluster) {
      bestCluster.items.push(item);
      bestCluster.vecs.push(vec);
      bestCluster.centroid    = meanVec(bestCluster.vecs);
      bestCluster.dominantCat = dominantCategory(bestCluster.items);
    } else {
      clusters.push({ centroid: vec, items: [item], vecs: [vec], dominantCat: item.category ?? "other" });
    }
  }

  // LLM でクラスタに命名
  const titles = await nameGroupClusters(clusters.map((c) => c.items));

  const groups: NewsGroup[] = clusters.map((cluster, i) => ({
    groupTitle:   titles[i],
    items:        cluster.items,
    singleOutlet: new Set(cluster.items.map((item) => item.source)).size <= 1,
    topic:        titles[i],
    category:     dominantCategory(cluster.items),
    subcategory:  dominantSubcategory(cluster.items),
  }));

  groups.sort((a, b) => {
    if (a.singleOutlet !== b.singleOutlet) return a.singleOutlet ? 1 : -1;
    return b.items.length - a.items.length;
  });

  return groups;
}

// ── インクリメンタルグループ化 ──────────────────────────

const TIME_WINDOW_MS  = 3  * 24 * 60 * 60 * 1000;
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

  // 1. DB から既存 embedding を取得
  const storedMap = await getRssArticleEmbeddingMap(
    recent.filter((i) => i.url).map((i) => i.url!)
  );

  // 2. embedding がない記事のみ embedBatch
  const needEmbed = recent.filter((i) => !i.url || !storedMap.has(i.url));
  let newVecs: (number[] | null)[] = [];
  if (needEmbed.length > 0) {
    newVecs = await embedBatch(
      needEmbed.map((i) => i.summary ? `${i.title}\n${i.summary.slice(0, 200)}` : i.title)
    );
  }
  let needEmbedIdx = 0;

  // 3. 全記事の embedding を itemVecs に揃える
  const itemVecs: (number[] | null)[] = recent.map((item) => {
    if (item.url && storedMap.has(item.url)) return storedMap.get(item.url)!;
    const vec = newVecs[needEmbedIdx++] ?? null;
    return vec;
  });

  // 4. 重複除去（cosine類似度 > 0.95 の記事は後者を除外）
  const DEDUP_THRESHOLD = 0.95;
  const dedupedRecent: RssFeedItem[] = [];
  const dedupedVecs:   (number[] | null)[] = [];
  for (let i = 0; i < recent.length; i++) {
    const vec = itemVecs[i];
    if (!vec) { dedupedRecent.push(recent[i]); dedupedVecs.push(null); continue; }
    let isDup = false;
    for (let j = 0; j < dedupedVecs.length; j++) {
      const dv = dedupedVecs[j];
      if (dv && cosineSimilarity(vec, dv) > DEDUP_THRESHOLD) { isDup = true; break; }
    }
    if (!isDup) { dedupedRecent.push(recent[i]); dedupedVecs.push(vec); }
  }

  // 5. 古いグループ削除 & アクティブなFeedGroupをDBから取得（並行）
  const [, existingGroups] = await Promise.all([
    deleteStaleFeedGroups().catch(() => {}),
    getActiveFeedGroups().catch((err) => {
      console.warn("[incrementalGroup] FeedGroup取得失敗:", err?.message);
      return [] as FeedGroupRecord[];
    }),
  ]);

  // 6. 各記事を既存グループにマッチ or 未マッチに振り分け
  const unmatched:     RssFeedItem[]       = [];
  const unmatchedVecs: (number[] | null)[] = [];
  const assignments    = new Map<string, {
    group: FeedGroupRecord;
    items: RssFeedItem[];
    vecs:  number[][];
  }>();

  for (let i = 0; i < dedupedRecent.length; i++) {
    const item = dedupedRecent[i];
    const vec  = dedupedVecs[i];

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

  // 7. マッチしたグループのcentroid更新 & FeedGroupItem保存
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
      topic:        group.title,
      category:     dominantCategory(assigned),
      subcategory:  dominantSubcategory(assigned),
    });
  }

  // 8. 未マッチ記事をOllamaで新規グループ化
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

// ── カテゴリヘルパー ─────────────────────────────────────

function dominantCategory(items: RssFeedItem[]): string {
  const counts = new Map<string, number>();
  for (const item of items) {
    const t = item.category ?? "other";
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  let best = "other", bestN = 0;
  for (const [t, n] of counts) {
    if (n > bestN) { bestN = n; best = t; }
  }
  return best;
}

function dominantSubcategory(items: RssFeedItem[]): string | undefined {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (!item.subcategory) continue;
    counts.set(item.subcategory, (counts.get(item.subcategory) ?? 0) + 1);
  }
  if (counts.size === 0) return undefined;
  let best = "", bestN = 0;
  for (const [t, n] of counts) {
    if (n > bestN) { bestN = n; best = t; }
  }
  return best;
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
