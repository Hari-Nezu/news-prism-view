# グルーピング点検・修正 拡張設計 (Feedback, Override)

今後の拡張として予定されている「表示の動的オーバーライド」および「人間によるフィードバックの次回バッチ影響（Next Batch Action）」の設計。

## 現在の実装状況

### 実装済み

- `/inspect` ページ (`src/app/inspect/page.tsx`) — グループ一覧の閲覧
- `GET /api/batch/inspect?groupId=` — グループ詳細取得
- `POST /api/batch/inspect/recompute` — 診断・再計算（centroid類似度、nearest neighbors、alternative clusters、threshold simulation）
- `RecomputeGroupInspect` (`shared/db/snapshots.go`) — neighbor検索は記事ごとに並列実行

### 未実装

#### 1. override (表示上の強制オーバーライド)

- `hide_article`
- `move_article`
- `rename_group`
- `hide_group`

重要なのは、`processed_snapshots` や `snapshot_groups` といった元スナップショットテーブルは不変に保ち、overlay 的に別テーブルで管理すること。

#### 2. feedback 記録

運用者の判断ログ蓄積や、それが次回バッチの係数に影響を与える仕組み。
- `POST /api/batch/inspect/feedback`

#### 3. 専用詳細ページ

`/inspect/[snapshotId]/[groupId]` のような単立詳細ページの実装。

## Feedbackと調整フロー（人間による検証と反映）

人間が `/inspect` 上で「違和感のあるグルーピング（＝混ざるべきでない記事が同じグループにいる）」を発見した場合に、原因を特定し、次回の計算（Next Time）で確実に別の計算グルーピングがなされるよう調整するフロー。

### a. 異常のパターンと原因診断
現在のロジック（`batch/internal/pipeline/steps/group.go`）は「コサイン類似度のみによる貪欲法」に基づく（カテゴリによるHard Gateは廃止済み。カテゴリは事後的に `dominantCate` で割り当てられる）。合流してしまう主な原因は以下の通り。

1. **閾値とドメインのミスマッチ**: 異なる事象だが、語彙が似ているためコサイン類似度がしきい値を超えてしまった。
2. **カテゴリ・サブカテゴリの混在**: カテゴリゲートが無いため、異なるカテゴリの記事でも類似度が高ければ同じグループに合流する。
3. **初動の分類間違い**: Phase 2 のカテゴリ分類時点で失敗しており、グループのカテゴリラベルが不正確になる。

### b. フィードバックの具体的なステップ（システム構造）

1. **診断と解析パラメーターの表示 (Diagnose)** ✅ 実装済み
   - `POST /api/batch/inspect/recompute` APIにより、centroid類似度・nearest neighbors・alternative clusters・threshold simulationを提示。
   - **注意**: recompute内のcategory gateペナルティ（`shared/db/snapshots.go`）は、バッチ側の `GroupArticles` がカテゴリゲートを廃止した現状と不整合。将来的に統一が必要。

2. **チューニング・シミュレーション ("What is" 若しくは "What if")**
   - UI上で、「もし全体閾値を 0.70 → 0.73 に上げていれば」などの仮想解消シナリオをシミュレーションしてプレビュー表示する。

3. **計算ルールへのフィードバック（Next Batch Action）**
   - ユーザーは最適な解決策を選び保存する。
   - **カテゴリ・サブカテゴリ別閾値の動的調整**
   - **ペナルティ係数の有効化**
   - **LLMプロンプト改善への回送**

4. **表示上の強制オーバーライド (Manual Overlay for Production)**
   - 次回計算への反映だけでなく、前述の override の仕組みを用いて画面上の体裁を直ちに整える。

## Feedbackループ設計（Next Batch Action）詳細

### 設計方針

- **チューニングパラメータは DB に保存**し、Go バッチが毎回読み出す
- パラメータは **カテゴリ単位** で設定（サブカテゴリ単位は将来拡張）
- Go 側の `GroupArticles` は `threshold float64` から `GroupingParams` 設定構造体へ変更
- recompute API のシミュレーションも同じパラメータを参照し、Go 側との整合性を保つ

### スキーマ

```sql
CREATE TABLE grouping_params (
  category        TEXT PRIMARY KEY,       -- "politics", "economy", ... / "__default__" でグローバル
  threshold       DOUBLE PRECISION,       -- カテゴリ別クラスタリング閾値（NULL = デフォルト使用）
  subcat_penalty  DOUBLE PRECISION,       -- サブカテゴリ不一致時の類似度減算（NULL = 0）
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      TEXT                    -- "manual" | "inspect-feedback" 等
);
```

Prisma モデル:

```prisma
model GroupingParam {
  category     String   @id(map: "GroupingParam_pkey")
  threshold    Float?
  subcatPenalty Float?  @map("subcat_penalty")
  updatedAt    DateTime @default(now()) @map("updated_at") @db.Timestamptz(6)
  updatedBy    String?  @map("updated_by")

  @@map("grouping_params")
}
```

`__default__` 行にグローバルデフォルトを入れ、カテゴリ固有行があればそちらを優先する。

### Go 側の変更

現在の `GroupArticles` シグネチャ:

```go
// batch/internal/pipeline/steps/group.go
func GroupArticles(articles []db.Article, threshold float64) []Cluster
```

カテゴリゲートは廃止済み。クラスタリングはコサイン類似度のみで判定し、カテゴリは `dominantCate` で事後割り当て。

#### 1. パラメータ読み出し（`shared/db/grouping_params.go` — 新規）

```go
type GroupingParams struct {
    Category      string
    Threshold     float64
    SubcatPenalty float64
}
// GetGroupingParams は grouping_params テーブルから全行読み出す。
```

#### 2. `GroupArticles` のシグネチャ変更

```go
type ClusterConfig struct {
    DefaultThreshold      float64
    UnknownCategoryOffset float64
    Params                map[string]db.GroupingParams // category → params
}

func GroupArticles(articles []db.Article, cfg ClusterConfig) []Cluster
```

#### 3. クラスタリングロジックの変更点

カテゴリ別閾値とサブカテゴリペナルティを導入:

```go
sim := float64(cosineSimilarity(a.Embedding, c.Centroid))
sim -= cfg.subcatPenalty(a.Category, a.Subcategory, c.DomSubcat)
if sim > localThreshold { ... }
```

### API: フィードバック保存

```http
PUT /api/grouping-params/:category
```

リクエスト例:

```json
{
  "threshold": 0.75,
  "subcatPenalty": 0.05,
  "updatedBy": "inspect-feedback"
}
```

### データフロー（全体像）

```text
/inspect (UI)                          ✅ 実装済み
  ├─ グループ詳細
  │    └─ GET /api/batch/inspect       ✅ 実装済み
  └─ 再計算ボタン
       └─ POST /api/batch/inspect/recompute  ✅ 実装済み
            └─ 診断結果 + シミュレーション表示
                 └─ 「閾値を保存」ボタン          ❌ 未実装
                      └─ PUT /api/grouping-params/:category
                           └─ grouping_params テーブルに UPSERT
                                │
                                ▼  (次回バッチ実行時)
                           Go pipeline.Run()
                             └─ db.GetGroupingParams()
                                  └─ steps.GroupArticles(articles, clusterCfg)
```

## 実装ステップ

| ステップ | 内容 | 状態 |
|:--|:--|:--|
| 0 | `/inspect` ページ + `GET /api/batch/inspect` + `POST /api/batch/inspect/recompute` | ✅ 完了 |
| 1 | `grouping_params` テーブル作成 + Prisma モデル追加 | 未着手 |
| 2 | Go 側: `GetGroupingParams` + `ClusterConfig` 導入（テーブルが空なら既存動作と同一） | 未着手 |
| 3 | `PUT /api/grouping-params/:category` API 実装 | 未着手 |
| 4 | recompute API を `grouping_params` 参照に変更 + category gate の整合性修正 | 未着手 |
| 5 | `/inspect` UI にパラメータ保存ボタン追加 | 未着手 |

## スキーマ変更候補 (将来用)

再計算診断を安定化したい場合に限って、将来的に以下のような保存を検討する。

```sql
ALTER TABLE snapshot_group_items ADD COLUMN similarity FLOAT;
ALTER TABLE snapshot_group_items ADD COLUMN category_mismatch BOOLEAN;
ALTER TABLE snapshot_group_items ADD COLUMN similarity_before_penalty FLOAT;
```
