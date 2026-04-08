# グルーピング点検・修正 運用設計

## 概要

グルーピング点検機能は **一部実装済み**。  
現状は「保存済みのスナップショットを見て、軽微な異常を検出する」ところまで入っている。

一方で、以下はまだ未実装。

- embedding を使った再計算診断
- 閾値シミュレーション
- 表示上の override
- feedback 記録

この文書では、現行実装と将来案を分けて整理する。

---

## 問題構造

| 層 | 原因 | 例 | 対応 |
|:--|:--|:--|:--|
| **Embedding** | ベクトル化が不正確 | 「石破首相が訪米」と「石破首相が記者会見」が近すぎる | モデル改善 |
| **Clustering** | 閾値や greedy 順序の問題 | 本来別トピックだが合流した | 再計算診断 |
| **Naming** | グループ自体は妥当だが名前が悪い | 広すぎるタイトル | タイトル補正 |
| **運用補正** | 表示上だけ扱いを変えたい | 一部記事だけ除外したい | override |

現状の実装が扱っているのは、このうち主に「保存済みデータ上で見える異常」の確認である。

---

## 実装済み

### 1. `/inspect` ページ

[inspect/page.tsx](/Users/mk/Development/NewsPrismView/news-prism-view/src/app/inspect/page.tsx) は実装済み。

役割は次の2つ。

- `feed` タブ: `FeedGroup` の一覧確認
- `snapshot` タブ: バッチ結果の `SnapshotGroup` 一覧確認

### 2. snapshot タブの詳細点検

snapshot タブでは以下が実装済み。

- `GET /api/batch/latest` で最新スナップショットを取得
- グループごとの展開表示
- lazy fetch で `GET /api/batch/inspect?snapshotId=...&groupId=...` を実行
- 保存済み記事一覧の表示
- 軽微な issue の表示

つまり、以前の構想にあった「将来的に `/inspect/[snapshotId]/[groupId]` へ分離するかもしれない」という段階の前に、まず `/inspect` の中で詳細表示を実装した状態になっている。

### 3. `GET /api/batch/inspect`

[/api/batch/inspect](/Users/mk/Development/NewsPrismView/news-prism-view/src/app/api/batch/inspect/route.ts) は実装済み。

この API は **保存済みデータだけ** を返す。

内部では [getSnapshotGroupDetail](/Users/mk/Development/NewsPrismView/news-prism-view/src/lib/db.ts#L517) を呼び、次を返す。

- `snapshotId`
- `groupId`
- `groupTitle`
- `category`
- `subcategory`
- `rank`
- `singleOutlet`
- `coveredBy`
- `silentMedia`
- `articles[]`
- `summary.totalArticles`
- `summary.byCategory`
- `summary.issues`

### 4. 自動 issue 検出

現在の issue 検出は [db.ts](/Users/mk/Development/NewsPrismView/news-prism-view/src/lib/db.ts#L539) で実装済み。

現時点で出しているものは次の3種類。

- `cross_category_mismatch`
- `no_category`
- `subcategory_mismatch`

判定ロジックも、保存済みデータだけで計算できる範囲に留まっている。

### 5. 現在の UI で見えるもの

- グループタイトル
- ランク
- カテゴリ
- `coveredBy` / `silentMedia`
- 記事一覧
- カテゴリ混在警告
- サブカテゴリ混在警告
- グループカテゴリ未設定警告

---

## 現在のデータフロー

```text
/inspect
  ├─ GET /api/feed-groups
  └─ GET /api/batch/latest
        └─ snapshot groups 一覧表示
             └─ グループ展開
                  └─ GET /api/batch/inspect?snapshotId=...&groupId=...
                       └─ 保存済み詳細 + issue 表示
```

ここでは DB に保存されている事実だけを見る。  
embedding や類似度の再計算はまだ行っていない。

---

## まだ未実装

### 1. 再計算診断

未実装。

まだ無いもの:

- `POST /api/batch/inspect/recompute`
- `similarityToCentroid`
- `similarityBeforePenalty`
- `similarityAfterPenalty`
- `nearestNeighbors`
- `alternativeClusters`
- 閾値変更シミュレーション

これらは保存済みデータだけでは出せず、embedding とクラスタリングロジックを使った再計算が必要になる。

### 2. override

未実装。

まだ無いもの:

- override 用テーブル
- `POST /api/batch/inspect/overrides`
- 表示上だけ記事を除外 / 移動 / リネームする仕組み

方針としては、`processed_snapshots` / `snapshot_groups` / `snapshot_group_items` は不変に保ち、overlay 的に別管理するのが妥当。

### 3. feedback 記録

未実装。

まだ無いもの:

- `POST /api/batch/inspect/feedback`
- 運用者の判断ログ蓄積

### 4. 専用詳細ページ

未実装。

今は `/inspect` の中で完結しており、`/inspect/[snapshotId]/[groupId]` はまだ存在しない。

---

## 現在の API 仕様

### `GET /api/batch/inspect?snapshotId=<id>&groupId=<id>`

保存済みデータだけを返す。

レスポンス例:

```json
{
  "snapshotId": "abc123",
  "groupId": "xyz789",
  "groupTitle": "石破首相の外交動向",
  "category": "politics",
  "subcategory": "diplomacy",
  "rank": 3,
  "singleOutlet": false,
  "coveredBy": ["NHK", "朝日新聞"],
  "silentMedia": ["読売新聞", "日本経済新聞"],
  "articles": [
    {
      "title": "石破首相が訪米、バイデン大統領と会談",
      "url": "https://nhk.jp/...",
      "source": "NHK",
      "publishedAt": "2026-04-08T10:30:00Z",
      "category": "politics",
      "subcategory": "diplomacy",
      "summary": "..."
    }
  ],
  "summary": {
    "totalArticles": 2,
    "byCategory": {
      "politics": 1,
      "economy": 1
    },
    "issues": [
      {
        "type": "cross_category_mismatch",
        "severity": "medium",
        "message": "カテゴリが2種類混在 (politics, economy)"
      }
    ]
  }
}
```

### 現時点で返さないもの

- 類似度
- centroid 距離
- penalty 適用前後の値
- 代替クラスタ候補
- 再計算由来の explanation

---

## 実装フェーズの現況

| Phase | 内容 | 状態 |
|:--|:--|:--|
| **P0** | `/inspect` の snapshot 詳細表示 | 実装済み |
| **P1** | `GET /api/batch/inspect` | 実装済み |
| **P2** | 軽微な自動警告 | 実装済み |
| **P3** | `POST /api/batch/inspect/recompute` | 未実装 |
| **P4** | override テーブル追加 | 未実装 |
| **P5** | override 操作UI | 未実装 |
| **P6** | feedback 記録 | 未実装 |
| **P7** | 閾値シミュレーション | 未実装 |

---

## 将来案

### 1. 再計算診断 API

候補:

`POST /api/batch/inspect/recompute`

用途:

- なぜそのグループに入ったかを説明する
- 代替候補グループを出す
- 閾値変更の影響を見る

ただしこれは「保存済み事実」ではなく、**現行ロジックによる再解釈** になる。

### 2. override

候補:

- `hide_article`
- `move_article`
- `rename_group`
- `hide_group`

重要なのは、元スナップショットを直接書き換えないこと。

### 3. feedback

用途:

- threshold 調整の参考
- カテゴリペナルティ係数の見直し
- embedding モデル変更判断
- 命名ロジック改善

---

## スキーマ変更候補

現状の点検機能だけなら、追加カラムなしで動いている。  
再計算診断を安定化したい場合に限って、将来的に保存を検討する。

候補:

- スナップショット作成時の threshold
- カテゴリペナルティ係数
- 記事投入順
- 類似度関連カラム

例:

```sql
ALTER TABLE snapshot_group_items ADD COLUMN similarity FLOAT;
ALTER TABLE snapshot_group_items ADD COLUMN category_mismatch BOOLEAN;
ALTER TABLE snapshot_group_items ADD COLUMN similarity_before_penalty FLOAT;
```

ただし、これは現時点では必須ではない。

---

## 現在の結論

- 点検UIそのものはすでにある
- `GET /api/batch/inspect` も実装済み
- 今できるのは「保存済みデータの確認」と「軽微な異常の可視化」
- 再計算診断、override、feedback はまだ設計段階

今の文書は、点検機能をゼロから設計するための文書ではなく、**現状整理 + 次の拡張案** として扱うのが正しい。
