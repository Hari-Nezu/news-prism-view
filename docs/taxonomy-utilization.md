# 3層分類体系の計算への活用

## 活用箇所まとめ

| # | 活用箇所 | 効果 | 実装コスト |
|---|---------|------|-----------|
| 1 | グループ化ハードフィルタ | グループ精度向上 | 小 |
| 2 | LLMへのカテゴリコンテキスト | タイトル品質向上 | 小 |
| 3 | バイアス分析カテゴリ別集計 | 分析の意味が大幅向上 | 中 |
| 4 | カバレッジmatrixカテゴリ絞り込み | UI改善 | 中 |

---

## 1. グループ化ハードフィルタ（最優先）

**問題**: 純粋にembeddingコサイン類似度だけで判定するため、異カテゴリの記事が同一グループになりやすい。

```
例: 「日銀利上げ決定」(economy) と「日銀総裁が国会答弁」(politics) が
    embeddingの類似度が高いため同一グループに入ってしまう
```

**改善案A: 減衰（ソフトフィルタ）**

```typescript
// src/lib/news-grouper.ts
const sim = cosineSimilarity(vec, cluster.centroid);
const categoryMatch = item.category === cluster.dominantCategory;
const adjustedSim = categoryMatch ? sim : sim * 0.7; // 異カテゴリは30%減衰
```

**改善案B: 完全排除（ハードフィルタ）**

```typescript
// 異カテゴリは結合しない
if (cluster.dominantCategory && item.category
    && cluster.dominantCategory !== item.category) continue;
```

**実装箇所**: `src/lib/news-grouper.ts` — `groupArticlesByEvent()` および `incrementalGroupArticles()` 内のクラスタリングループ

---

## 2. LLMへのカテゴリコンテキスト（最優先）

**問題**: LLMにタイトル群だけ渡しているため、命名が文脈を欠く場合がある。

**改善案**: グループ内の支配的 category / subcategory を命名プロンプトに付加する。

```typescript
// src/lib/news-grouper.ts — nameGroupClusters()
const clusterList = clusters
  .map((items, i) => {
    const cat = dominantCategory(items);
    const sub = dominantSubcategory(items);
    const context = sub ? `${cat} > ${sub}` : cat;
    return `グループ${i}（${context}）: ${items.map((item) => `「${item.title}」`).join(" ")}`;
  })
  .join("\n");
```

```
変更前: グループ0: 「イランが核合意交渉を...」「米国がイランに...」
変更後: グループ0（politics > diplomacy）: 「イランが核合意交渉を...」「米国がイランに...」
```

カテゴリの文脈があることで、LLMが「政治的なイベント名」として適切に命名しやすくなる。

**実装箇所**: `src/lib/news-grouper.ts` — `nameGroupClusters()`

---

## 3. バイアス分析のカテゴリ別スタンス集計

**問題**: 3軸スコアを全記事で平均すると、記事量の多いカテゴリ（スポーツ等）に引っ張られる。カテゴリ別に集計することで初めて意味のある媒体比較になる。

```
全記事平均の問題:
  読売新聞 diplomatic平均: -0.1（スポーツ記事が多く薄まっている）

カテゴリ別集計:
  読売新聞 × politics × diplomatic: -0.4（タカ派寄り）
  朝日新聞 × politics × diplomatic: +0.3（ハト派寄り）
  → 同じ「外交」カテゴリ内での論調差が可視化できる
```

**実装箇所**: 新規 `/api/bias/stance` エンドポイント

```typescript
// レスポンス設計
interface StanceResponse {
  media: string;
  byCategory: {
    category: string;
    articleCount: number;
    avgEconomic:   number;
    avgSocial:     number;
    avgDiplomatic: number;
  }[];
}
```

`Article` テーブルの `category` × `source` でGROUP BYして集計。

---

## 4. カバレッジmatrixのカテゴリ絞り込み

**問題**: 全トピックを一覧すると量が多くなり、「政治カテゴリで報道しない媒体」を見つけにくい。

**改善案**: UIでcategoryフィルタを追加し、選択したcategoryのグループだけ表示する。

```typescript
// /api/bias/coverage の CoverageGroup にすでに category が付いている
// → フロントエンドでフィルタするだけで実現可能
const filtered = groups.filter((g) => g.category === selectedCategory);
```

**実装箇所**: バイアス分析UIコンポーネント（Phase 4）

---

## 実装順序（推奨）

グループ化精度とタイトル品質の改善を優先する。

1. **#2 LLMカテゴリコンテキスト** — `nameGroupClusters()` のプロンプト修正のみ、最小コスト
2. **#1 グループ化ハードフィルタ** — まずソフトフィルタ（減衰）から試し、精度を見て調整
3. **#3 カテゴリ別スタンス集計** — バイアス分析UIと合わせて実装
4. **#4 カバレッジmatrixフィルタ** — UI実装時に追加
