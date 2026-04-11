# グルーピング点検・修正 仕様

## 概要

グルーピング点検機能として、保存済みのスナップショットを見て軽微な異常を検出・表示し、embedding を使った再計算シミュレーションを行う機能が実装されている。

## 問題構造

| 層 | 原因 | 例 | 対応 |
|:--|:--|:--|:--|
| **Embedding** | ベクトル化が不正確 | 「石破首相が訪米」と「石破首相が記者会見」が近すぎる | モデル改善 |
| **Clustering** | 閾値や greedy 順序の問題 | 本来別トピックだが合流した | 再計算診断 |
| **Naming** | グループ自体は妥当だが名前が悪い | 広すぎるタイトル | タイトル補正 |
| **運用補正** | 表示上だけ扱いを変えたい | 一部記事だけ除外したい | override（設計中） |

現状の実装は「保存済みデータ上で見える異常」の確認と、「再計算シミュレーション」に対応する。

## 実装済み機能

### 1. `/inspect` ページ

`src/app/inspect/page.tsx` は実装済み。
- `feed` タブ: `FeedGroup` の一覧確認
- `snapshot` タブ: バッチ結果の `SnapshotGroup` 一覧確認

### 2. snapshot タブの詳細点検

- `GET /api/batch/latest` で最新スナップショットを取得
- グループごとの展開表示
- lazy fetch で `GET /api/batch/inspect?snapshotId=...&groupId=...` を実行
- 保存済み記事一覧の表示
- 軽微な issue の表示
- 再計算診断の実行と結果表示

### 3. `GET /api/batch/inspect`

`src/app/api/batch/inspect/route.ts` 
この API は保存済みデータだけを返す。
内部で `getSnapshotGroupDetail` を呼び、以下を返す。
- snapshotId, groupId, groupTitle, category, subcategory, rank, singleOutlet, coveredBy, silentMedia, articles[], summary（totalArticles, byCategory, issues）

### 4. 自動 issue 検出

DB 側（`db.ts`）で自動警告を発行する。
- `cross_category_mismatch`
- `no_category`
- `subcategory_mismatch`

### 5. `POST /api/batch/inspect/recompute`（再計算診断）

`src/app/api/batch/inspect/recompute/route.ts` にて、embedding を使った再計算をリアルタイムで行う。
- 記事ごとの `similarityToCentroid` / `similarityBeforePenalty` / `similarityAfterPenalty`
- `nearestNeighbors`（全記事から上位5件）
- `alternativeClusters`（他グループ centroid への類似度、上位3件）
- `wouldJoinAtThreshold`（指定閾値で残留するかの判定）
- `thresholdSimulation`（グループ全体での残留/離脱/embedding無の集計）

### 6. 現在の UI で見えるもの

- グループタイトル、ランク、カテゴリ
- `coveredBy` / `silentMedia`
- 記事一覧
- カテゴリ/サブカテゴリ混在等の警告
- 再計算結果（centroid 類似度、nearest neighbors、代替クラスタ）
- 閾値シミュレーション（残留/離脱数）

## データフロー

```text
/inspect
  ├─ GET /api/feed-groups
  └─ GET /api/batch/latest
        └─ snapshot groups 一覧表示
             └─ グループ展開
                  ├─ GET /api/batch/inspect?snapshotId=...&groupId=... (DB情報)
                  └─ POST /api/batch/inspect/recompute (再計算ロジック)
```
