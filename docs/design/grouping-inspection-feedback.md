# グルーピング点検・修正 拡張設計 (Feedback, Override)

今後の拡張として予定されている「表示の動的オーバーライド」および「人間によるフィードバックの次回バッチ影響（Next Batch Action）」の設計。

## まだ未実装の機能

### 1. override (表示上の強制オーバーライド)

- `hide_article`
- `move_article`
- `rename_group`
- `hide_group`

重要なのは、`processed_snapshots` や `snapshot_groups` といった元スナップショットテーブルは不変に保ち、overlay 的に別テーブルで管理すること。

### 2. feedback 記録

運用者の判断ログ蓄積や、それが次回バッチの係数に影響を与える仕組み。
- `POST /api/batch/inspect/feedback`

### 3. 専用詳細ページ

`/inspect/[snapshotId]/[groupId]` のような単立詳細ページの実装。

## Feedbackと調整フロー（人間による検証と反映）

人間が `/inspect` 上で「違和感のあるグルーピング（＝混ざるべきでない記事が同じグループにいる）」を発見した場合に、原因を特定し、次回の計算（Next Time）で確実に別の計算グルーピングがなされるよう調整するフロー。

### a. 異常のパターンと原因診断
現在のロジック（`group.go`）は「カテゴリごとのHard Gate ＋ コサイン類似度の貪欲法」に基づく。合流してしまう主な原因は以下の通り。

1. **閾値とドメインのミスマッチ**: 異なる事象だが、語彙が似ているためコサイン類似度がしきい値を超えてしまった。
2. **サブカテゴリの違い**: 同じカテゴリでもサブカテゴリが違うにも関わらず合流した。現在はサブカテゴリ不一致によるペナルティが無いため防げない。
3. **初動の分類間違い**: Phase 2 のカテゴリ分類時点で失敗しており、想定外のグループのCentroidに吸い込まれた。

### b. フィードバックの具体的なステップ（システム構造）

1. **診断と解析パラメーターの表示 (Diagnose)**
   - 違和感のある記事に対して「診断」を行い、既存の `POST /api/batch/inspect/recompute` APIにより類似度等の数学的根拠を提示する。

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

#### 1. パラメータ読み出し（`db/grouping_params.go`）

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
    DefaultThreshold     float64
    UnknownCategoryOffset float64
    Params               map[string]db.GroupingParams // category → params
}

func GroupArticles(articles []db.Article, cfg ClusterConfig) []Cluster
```

#### 3. クラスタリングロジックの変更点

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
/inspect (UI)
  └─ 再計算ボタン
       └─ POST /api/batch/inspect/recompute
            └─ 診断結果 + シミュレーション表示
                 └─ 「閾値を保存」ボタン
                      └─ PUT /api/grouping-params/:category
                           └─ grouping_params テーブルに UPSERT
                                │
                                ▼  (次回バッチ実行時)
                           Go pipeline.Run()
                             └─ db.GetGroupingParams()
                                  └─ steps.GroupArticles(articles, clusterCfg)
```

## 実装ステップ

| ステップ | 内容 |
|:--|:--|
| 1 | `grouping_params` テーブル作成 + Prisma モデル追加 |
| 2 | Go 側: `GetGroupingParams` + `ClusterConfig` 導入（テーブルが空なら既存動作と同一） |
| 3 | `PUT /api/grouping-params/:category` API 実装 |
| 4 | recompute API を `grouping_params` 参照に変更 |
| 5 | `/inspect` UI にパラメータ保存ボタン追加 |

## スキーマ変更候補 (将来用)

再計算診断を安定化したい場合に限って、将来的に以下のような保存を検討する。

```sql
ALTER TABLE snapshot_group_items ADD COLUMN similarity FLOAT;
ALTER TABLE snapshot_group_items ADD COLUMN category_mismatch BOOLEAN;
ALTER TABLE snapshot_group_items ADD COLUMN similarity_before_penalty FLOAT;
```
