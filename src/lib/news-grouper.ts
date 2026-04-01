import { z } from "zod";
import type { RssFeedItem, NewsGroup } from "@/types";
import { embedBatch } from "@/lib/embeddings";
import {
  getActiveFeedGroups,
  createFeedGroup,
  updateFeedGroupCentroid,
  upsertFeedGroupItems,
  deleteStaleFeedGroups,
  type FeedGroupRecord,
} from "@/lib/db";

import { OLLAMA_BASE_URL, OLLAMA_MODEL } from "@/lib/config";

const GroupSchema = z.object({
  groups: z.array(
    z.object({
      group_title: z.string(),
      indices: z.array(z.number().int()),
    })
  ),
});

const SYSTEM_PROMPT = `あなたはニュース記事の分類専門家です。
与えられた記事タイトルのリストを「同一ニュースイベント」ごとにグループ化してください。

## ルール
- 同じ出来事・政策・事件を報じている記事を同一グループにまとめる
- 関連はあるが別の出来事（例: 同じ政策の異なる局面）は別グループにする
- グループ名は20字以内の簡潔な日本語で命名する
- 必ずJSON形式のみで回答する（説明文不要）

## 出力フォーマット
{
  "groups": [
    { "group_title": "グループ名", "indices": [0, 2, 4] },
    { "group_title": "別のグループ名", "indices": [1, 3] }
  ]
}`;

/**
 * 複数記事をOllamaで同一ニュースごとにグループ化する
 * @returns グループ配列（複数媒体のグループが先頭に来るようソート済み）
 */
export async function groupArticlesByEvent(
  items: RssFeedItem[]
): Promise<NewsGroup[]> {
  if (items.length === 0) return [];

  // 10件以下なら全件送信、多い場合は先頭30件に絞る
  const targets = items.slice(0, 30);

  const articleList = targets
    .map((item, i) => `${i}: 「${item.title}」- ${item.source}`)
    .join("\n");

  const prompt = `以下の${targets.length}件の記事を同一ニュースごとにグループ化してください。\n\n${articleList}`;

  const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      system: SYSTEM_PROMPT,
      prompt,
      stream: false,
      format: "json",
      options: { temperature: 0.1 },
    }),
  });

  if (!response.ok) {
    throw new Error(`グループ化APIエラー: ${response.status}`);
  }

  const data = await response.json();
  const raw = JSON.parse(data.response);
  const parsed = GroupSchema.parse(raw);

  // インデックスから RssFeedItem に変換
  const groups: NewsGroup[] = parsed.groups
    .map(({ group_title, indices }) => {
      const validIndices = indices.filter((i) => i >= 0 && i < targets.length);
      const groupItems = validIndices.map((i) => targets[i]);
      const uniqueSources = new Set(groupItems.map((item) => item.source));
      return {
        groupTitle: group_title,
        items: groupItems,
        singleOutlet: uniqueSources.size <= 1,
      };
    })
    .filter((g) => g.items.length > 0);

  // 複数媒体のグループを先頭に表示
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

  const threshold = parseFloat(
    process.env.FEED_GROUP_SIMILARITY_THRESHOLD ?? "0.68"
  );

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

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

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
