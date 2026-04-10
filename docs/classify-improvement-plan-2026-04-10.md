# Go バッチ カテゴリ分類の改善

## Context

Go バッチの `classify.go` はキーワードマッチのみで分類しており精度が低い。
`GroupArticles` はカテゴリ完全一致のハードゲートを持つため、誤分類 → 同一トピックが別グループに分断される。
さらに Go 側のカテゴリ名（international, society, environment, culture）と Next.js 側の正式taxonomy（politics, economy, business, health, disaster, sports, science_tech, culture_lifestyle）がズレている。

Next.js 側には既に **embedding→LLM カスケード分類器** (`news-classifier-llm.ts`) が動作しているので、同じロジックを Go に移植する。

## 方針

TS 実装と同じカスケード: **embedding 類似度分類 → LLM フォールバック → キーワードフォールバック**

### embedding プレフィックスについて

ruri-v3-310m は非対称モデル：
- 参照（サブカテゴリ説明）→ `"文章: "` (DOC)
- 記事テキスト → `"クエリ: "` (QUERY)

これは TS 実装と同じ。DB に保存済みの embedding は DOC プレフィックスだが、分類には QUERY プレフィックスが必要なため、**分類時に再 embed が必要**（TS 版も同じ）。参照 embedding はパイプライン起動時に1回だけ生成しキャッシュ。

## 変更ファイル

### 1. `backend/internal/taxonomy/taxonomy.go`（新規）

`news-taxonomy-configs.ts` と同一の 8 カテゴリ定義を Go 構造体で定義。

```go
type Subcategory struct { ID, Label, Description string }
type Category struct { ID, Label, Description string; Subcategories []Subcategory }
var Categories = []Category{...}  // 8カテゴリ
func AllSubcategoryTexts() []struct{ CategoryID, SubcategoryID, Text string }
func BuildClassificationGuide() string  // LLMプロンプト用
func ValidCategoryIDs() map[string]bool
```

### 2. `backend/internal/llm/embed.go`（修正）

prefix を指定可能にする：

```go
func (c *EmbedClient) EmbedBatchWithPrefix(ctx, texts []string, prefix string) ([][]float32, error)
```

既存の `EmbedBatch` は内部で `EmbedBatchWithPrefix(ctx, texts, "文章: ")` を呼ぶラッパーに変更。

### 3. `backend/internal/llm/chat.go`（修正）

JSON 応答用メソッドを追加：

```go
func (c *ChatClient) CompleteJSON(ctx, system, user string) (string, error)
// temperature=0.1, response_format=json_object
```

### 4. `backend/internal/pipeline/steps/classify.go`（書き換え）

シグネチャ変更：
```go
func Classify(ctx context.Context, pool *db.Pool, embedClient *llm.EmbedClient, chatClient *llm.ChatClient, threshold float64) error
```

ロジック：
1. `sync.Once` で参照 embedding 生成（`embedClient.EmbedBatchWithPrefix(ctx, texts, "文章: ")`）
2. `GetUnclassifiedArticles` で未分類記事取得（title + summary あり）
3. 記事テキストを `"クエリ: "` プレフィックスで batch embed
4. 各記事の embedding と全参照 embedding のコサイン類似度を計算、最良マッチ取得
5. `sim >= threshold`(0.5) → その category/subcategory を採用
6. 閾値未満 → LLM バッチ分類にエスカレーション
7. LLM 失敗 → キーワードフォールバック（カテゴリ名を新 taxonomy に更新）
8. `SaveClassifications` で保存

キーワードマップも新8カテゴリに更新（international→politics, society→culture_lifestyle, environment→science_tech, culture→culture_lifestyle に再編）。

### 5. `backend/internal/pipeline/pipeline.go`（修正）

```go
classifyClient := llm.NewChatClient(cfg.LLMBaseURL, cfg.ClassifyModel)
steps.Classify(ctx, pool, embedClient, classifyClient, cfg.EmbedClassifyThreshold)
```

## 変更しないもの

- `group.go`: カテゴリ名が統一されれば `canJoinCluster` の exact match はそのまま正しく機能する
- `store.go`, `name.go`: 変更不要
- DB スキーマ: 変更不要（既存の category/subcategory カラムに新しい値が入るだけ）

## 検証

1. `go build ./...` でビルド確認
2. `go test ./internal/pipeline/steps/...` — 既存 group テストが通ること
3. classify 用のユニットテスト追加：
   - embedding 分類で正しいカテゴリが返ること（モック embed client）
   - 閾値未満で LLM にフォールバックすること
   - LLM 失敗時にキーワードフォールバックすること
4. 実際にバッチ実行し、`snapshot_group_items` のカテゴリが新taxonomy に準拠していること
5. inspect 画面で cross_category_mismatch の減少を確認
