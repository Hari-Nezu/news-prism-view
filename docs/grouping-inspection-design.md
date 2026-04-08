# グルーピング点検・修正 運用設計

## 背景

バッチで生成されたニュースグループについて、

- なぜその構成になったのかを確認したい
- 表示上の補正をしたい
- 将来の改善に使えるフィードバックを残したい

という要求がある。

この3つは似ているが、実装上は別物である。ここでは以下の4層に分けて整理する。

1. **閲覧専用の点検**
2. **再計算を伴う診断**
3. **表示上の手動補正**
4. **将来改善のためのフィードバック記録**

---

## 問題構造

| 層 | 原因 | 例 | 対応 |
|:--|:--|:--|:--|
| **Embedding** | ベクトル化が不正確 | 「石破首相が訪米」と「石破首相が記者会見」の意味的距離が近すぎる | モデル/プリセット改善 |
| **Clustering** | 閾値や greedy 順序の問題 | 本来別トピックだが類似度閾値を超えて合流 | 再計算診断・閾値調整 |
| **Naming** | グループ自体は妥当だがタイトルが悪い | 実態と合わない名前が付く | 表示タイトル補正 |
| **運用補正** | 一部記事だけ表示上の扱いを変えたい | 1件だけ除外したい | overlay で補正 |

UI上の「このグループにこの記事がいるのはおかしい」は、必ずしも同じ原因ではない。  
まずは「保存済みデータだけで見える異常」なのか、「再計算しないと分からない原因」なのかを分ける。

---

## 1. 閲覧専用の点検

### 目的

まずは現在のスナップショットを壊さずに、保存済みデータだけで確認できる情報を出す。

### 対象ルート

- 既存 `/inspect` の snapshot タブ拡張を第一候補とする
- その後、必要なら `/inspect/[snapshotId]/[groupId]` の詳細画面へ分離する

### 保存済みデータだけで表示できる項目

- スナップショットメタ情報
- グループタイトル
- グループのカテゴリ / サブカテゴリ
- 記事一覧
- 媒体数
- `coveredBy` / `silentMedia`
- カテゴリ混在の有無
- 単独報道かどうか

### 閲覧専用API

`GET /api/batch/inspect?snapshotId=<id>&groupId=<id>`

このAPIは **DBに保存済みの情報だけ** を返す。

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
    },
    {
      "title": "石破首相、記者会見で経済対策に言及",
      "url": "https://asahi.jp/...",
      "source": "朝日新聞",
      "publishedAt": "2026-04-08T11:45:00Z",
      "category": "economy",
      "subcategory": "fiscal_policy",
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
        "message": "カテゴリが混在している"
      }
    ]
  }
}
```

### この段階でやらないこと

- 類似度の説明
- centroid との距離
- nearest neighbors
- alternative clusters
- 閾値変更シミュレーション

これらは保存済みデータだけでは安定して出せないため、次の「再計算診断」に分離する。

---

## 2. 再計算を伴う診断

### 目的

「なぜ入ったのか」「どこに入るべきだったか」を、埋め込みとクラスタリングロジックを使って再診断する。

### 前提

この診断は **DB参照だけでは完結しない**。

- 記事 embedding が必要
- 当時のクラスタリング条件が必要
- greedy clustering のため、記事順序も再現対象になる
- カテゴリ不一致ペナルティの有無を再計算する必要がある

### 診断API

`POST /api/batch/inspect/recompute`

```json
{
  "snapshotId": "abc123",
  "groupId": "xyz789"
}
```

### 返してよい項目

- `thresholdUsed`
- `similarityToCentroid`
- `similarityBeforePenalty`
- `similarityAfterPenalty`
- `crossCategoryPenaltyApplied`
- `nearestNeighbors`
- `alternativeClusters`

### レスポンス例

```json
{
  "snapshotId": "abc123",
  "groupId": "xyz789",
  "thresholdUsed": 0.87,
  "articles": [
    {
      "url": "https://asahi.jp/...",
      "title": "石破首相、記者会見で経済対策に言及",
      "similarityToCentroid": 0.874,
      "similarityBeforePenalty": 0.874,
      "similarityAfterPenalty": 0.612,
      "crossCategoryPenaltyApplied": true,
      "nearestNeighbors": [
        {
          "url": "https://nikkei.jp/...",
          "title": "政府の経済対策、6月に策定へ",
          "similarity": 0.856
        }
      ],
      "alternativeClusters": [
        {
          "groupId": "alt001",
          "groupTitle": "政府の経済対策",
          "similarityToCentroid": 0.821
        }
      ]
    }
  ]
}
```

### 注意

このAPIは「保存済み事実の表示」ではなく、**現行ロジックでの再解釈** である。  
そのため、レスポンスには以下を含める。

- 使用した threshold
- カテゴリペナルティ係数
- 再計算対象の記事数
- 再計算時刻

必要なら将来的に、スナップショット作成時の `threshold` を別カラムで保持する。

---

## 3. 表示上の手動補正

### 目的

ランキングや公開表示での見え方を補正したいが、元のバッチ結果は壊したくない。

### 方針

`processed_snapshots` / `snapshot_groups` / `snapshot_group_items` は **元データとして不変** に保つ。  
手動修正はスナップショット本体を書き換えず、overlay テーブルとして別管理する。

### やってはいけないこと

- `snapshot_group_items` から直接 DELETE
- 記事を別グループへ直接 UPDATE
- スナップショット本体を運用操作で書き換える

これをやると、

- バッチ結果の再現性が失われる
- 後から原因分析できなくなる
- 次回バッチとの差分比較が壊れる

### 補正アクションの種類

- 記事を非表示にする
- 記事を別グループに表示上だけ移す
- グループタイトルを上書きする
- グループ自体を公開面から除外する

### API案

`POST /api/batch/inspect/overrides`

```json
{
  "snapshotId": "abc123",
  "groupId": "xyz789",
  "action": "hide_article",
  "articleUrl": "https://asahi.jp/...",
  "reason": "カテゴリが異なり表示上は除外したい"
}
```

または

```json
{
  "snapshotId": "abc123",
  "groupId": "xyz789",
  "action": "rename_group",
  "title": "石破首相の訪米と日米首脳会談",
  "reason": "元タイトルが広すぎる"
}
```

### 読み出しルール

- 内部点検画面では「元データ」と「override適用後」の両方を見られるようにする
- 公開面では override 適用後のみを表示する

---

## 4. フィードバック記録

### 目的

今すぐ表示を変えるのではなく、将来の改善材料を残す。

### 特徴

- 表示結果を変えない
- スナップショットも変えない
- 運用者の判断ログだけを蓄積する

### API案

`POST /api/batch/inspect/feedback`

```json
{
  "snapshotId": "abc123",
  "groupId": "xyz789",
  "articleUrl": "https://asahi.jp/...",
  "action": "should_not_be_here",
  "confidence": 0.9,
  "reason": "economy 記事なのに politics グループに見える"
}
```

### 用途

- threshold 調整の参考
- カテゴリペナルティ係数の見直し
- embedding モデルの変更判断
- 命名ロジック改善の入力

---

## UI整理

### 画面の役割

- `/inspect`
  - 一覧確認
  - 問題がありそうなグループを見つける
- `/inspect/[snapshotId]/[groupId]`
  - 1グループの詳細点検
  - 元データ表示
  - 再計算診断
  - override 操作
  - feedback 登録

### 詳細画面の表示ブロック

1. **保存済みデータ**
2. **自動検出された軽微な異常**
3. **再計算診断結果**
4. **override 操作**
5. **feedback 登録**

---

## 実装フェーズ

| Phase | 内容 | 工数 | 備考 |
|:--|:--|:--|:--|
| **P0** ✅ | `/inspect` の snapshot 詳細表示拡張 | 小 | 保存済みデータのみ |
| **P1** ✅ | `GET /api/batch/inspect` | 小 | DB参照のみ |
| **P2** ✅ | 軽微な自動警告 | 小 | カテゴリ混在など |
| **P3** | `POST /api/batch/inspect/recompute` | 中 | embedding と再計算が必要 |
| **P4** | override テーブル追加 | 中 | 元スナップショットは不変 |
| **P5** | override 操作UI | 中 | 表示補正 |
| **P6** | feedback 記録 | 小 | 表示には未反映 |
| **P7** | 閾値シミュレーション | 中 | 再計算系の延長 |

---

## スキーマ変更の扱い

### すぐ必要なもの

閲覧専用の点検だけなら、まず追加カラムなしでも着手できる。

### 将来的にあるとよいもの

再計算説明を安定化するため、将来的には以下を保存候補にする。

- スナップショット作成時の threshold
- カテゴリペナルティ係数
- 記事投入順

### SQL例

物理テーブル名は `snake_case` を使う。

```sql
ALTER TABLE snapshot_group_items ADD COLUMN similarity FLOAT;
ALTER TABLE snapshot_group_items ADD COLUMN category_mismatch BOOLEAN;
ALTER TABLE snapshot_group_items ADD COLUMN similarity_before_penalty FLOAT;
```

ただし、これらは **必須ではない**。  
P0-P2 は既存スキーマのままでも進められる。

---

## 運用フロー

1. ランキングや `/inspect` 一覧で違和感を見つける
2. `GET /api/batch/inspect` で保存済みデータを確認する
3. 必要なら `recompute` を実行して、原因が embedding / clustering / naming のどこに近いかを見る
4. 表示上の補正が必要なら override を作る
5. 将来改善に回したい判断は feedback として残す

---

## 判断基準

### override を使うケース

- 今すぐ公開表示を直したい
- ただし元のバッチ結果は保持したい

### feedback だけでよいケース

- まだ表示を変えるほどではない
- 傾向を観察したい
- 将来の閾値調整に回したい

### 再計算診断が必要なケース

- 「なぜこのグループに入ったのか」の説明が欲しい
- 代替候補グループを見たい
- threshold 変更の影響を見たい
