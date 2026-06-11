---
status: current
scope: feature:eval
authoritative: true
last_verified: 2026-06-11
verified_against: main@f57460c
---

# eval バッチ — embeddingモデル比較

複数の embedding モデル（e5 / gemma / ruri 等）に対して**同じ記事集合**を埋め込み、
同じクラスタリングロジックで処理して品質を比較するためのオフライン評価パイプライン。本番の `rss_articles.embedding` には影響しない。

## 起動方法

```bash
go run ./cmd/newsprism-batch eval [flags]
```

| フラグ | デフォルト | 説明 |
|--------|---------|------|
| `-limit` | `500` | 対象記事数（`rss_articles` から直近3日分の最新N件） |
| `-threshold` | `0`（=`GROUP_CLUSTER_THRESHOLD`） | 共通クラスタ閾値（モデル別未指定時のフォールバック） |
| `-thresholds` | `""` | モデル別閾値。例: `e5=0.93,ruri=0.90,gemma=0.84` |
| `-run-id` | `""`（=自動採番） | run識別子。`{unix秒}-{6byte hex}` 形式で生成 |
| `-note` | `""` | `params.note` に保存される自由記述 |
| `-models` | `""`（=全エンドポイント） | カンマ区切りでモデル名を指定（例: `e5,gemma`） |

参照: `batch/cmd/newsprism-batch/main.go:71-99`

## 必要な環境変数

エンドポイント設定は `loadEvalConfig()` で行う（`batch/internal/config/config.go:69-111`）。`*_BASE_URL` と `*_MODEL` の両方が空でないモデルだけが評価対象になる。

| 変数 | デフォルト | 説明 |
|------|-----------|------|
| `EVAL_E5_BASE_URL` | `EMBED_BASE_URL` (`http://127.0.0.1:8081`) | e5サーバー |
| `EVAL_E5_MODEL` | `EMBED_MODEL` (`multilingual-e5-large-instruct-q8_0`) | e5モデル名（dim 1024） |
| `EVAL_GEMMA_BASE_URL` | `http://127.0.0.1:8081` | gemmaサーバー |
| `EVAL_GEMMA_MODEL` | `embeddinggemma-300M-Q8_0` | gemmaモデル名（dim 768） |
| `EVAL_GEMMA_PREFIX` | `""`（空） | gemma用prefix |
| `EVAL_RURI_BASE_URL` | `http://127.0.0.1:8081` | ruriサーバー |
| `EVAL_RURI_MODEL` | `Targoyle/ruri-v3-310m-GGUF:Q8_0` | ruriモデル名（dim 768） |
| `EVAL_RURI_PREFIX` | `"文章: "` | ruri用prefix |

**注意点:**

- e5 の prefix は `Instruct: ニュース記事を具体的な出来事・事件単位でクラスタリングする\nQuery: ` で**ハードコード**（`config.go:92`）。環境変数で上書きできない。
- 本番側の prefix は `EMBED_DOCUMENT_PREFIX` / `EMBED_QUERY_PREFIX` で設定可能（`shared/config/config.go`）。デフォルトは e5 用（document=Instruct クラスタリング、query=`query: `）。本番モデルを e5 以外に変える際は両方を上書きする。
- gemma / ruri の prefix がクラスタリング用途として適切でないと、過分離・過合流が prefix起因で発生する可能性がある。

## 処理フロー

`eval.Run()` (`batch/internal/pipeline/eval/eval.go:42-127`) が以下を順に実行する。

### 1. 対象記事の取得

`FetchTargets()` (`fetch.go:15-35`):

```sql
SELECT id, title, COALESCE(summary, '')
FROM rss_articles
WHERE published_at >= NOW() - INTERVAL '3 days'
ORDER BY fetched_at DESC
LIMIT $1
```

`published_at` 直近3日 × `fetched_at` 降順で `-limit` 件。

### 2. run レコードの先行保存

`SaveRun()` (`store.go:64-81`) で `rss_clustering_eval_runs` に行を作成（summaries は空のまま）。`ON CONFLICT (run_id) DO NOTHING`。

### 3. 全モデル並列で embedding

`EmbedAllModels()` (`embed.go:21-58`):

- 各エンドポイントを goroutine で並列実行
- テキストは `Title + "\n" + Summary`（Summary が空なら Title のみ）
- `EmbedBatchWithPrefix(ctx, texts, ep.Prefix)` で prefix を付けて埋め込み
- 結果は `rss_article_embeddings_eval`（PK: `rss_article_id, model_name`）に upsert
- いずれかのモデルが失敗しても他のモデルは続行（エラーは収集してログに記録）

### 4. モデル別並列でクラスタリング

`eval.go:77-110`：各モデルについて goroutine で：

1. `opts.ModelThresholds[ep.Name]` があればそちらを使い、なければ `opts.Threshold`
2. `injectEmbeddings()` で `db.Article{URL: ID, Title, Embedding}` の配列を構築（`URL` フィールドに `rss_articles.id` を入れる）
3. `steps.GroupArticles(articles, threshold)` で**本番と同じクラスタリングロジック**を適用
4. `SaveClusters()` (`store.go:38-62`) で `rss_clustering_eval` に一括 upsert
5. `Summarize()` (`metrics.go:5-47`) でサマリー指標を計算

### 5. サマリー指標

`ModelSummary` (`eval.go:26-34`) の各フィールド：

| フィールド | 計算 |
|---------|-----|
| `cluster_count` | クラスタ数 |
| `noise_ratio` | size=1 のクラスタ数 / **全記事数**（`metrics.go:30-32`） |
| `mean_cluster_size` | 全記事数 / クラスタ数 |
| `max_cluster_size` | 最大クラスタの記事数 |
| `mean_avg_similarity` | 各クラスタの平均類似度の平均（`AvgSimilarity > 0` のクラスタのみ対象） |

> `noise_ratio` の分母は全記事数（クラスタ数ではない）。size=1 のクラスタを「ノイズ」とみなす定義。

### 6. サマリーの永続化

`UpdateRunSummaries()` (`store.go:83-94`) で `params` に `summaries` を JSONB merge：

```sql
UPDATE rss_clustering_eval_runs
SET params = params || $2::jsonb
WHERE run_id = $1
```

## データモデル

`batch/migrations/005_eval_tables.sql`：

### `rss_article_embeddings_eval`

| カラム | 型 | 説明 |
|-------|----|----|
| `rss_article_id` | TEXT | `rss_articles(id)` への FK（CASCADE） |
| `model_name` | TEXT | エンドポイント名（`e5` / `gemma` / `ruri`） |
| `dim` | INT | ベクトル次元数 |
| `embedding` | vector | pgvector |
| `created_at` | TIMESTAMPTZ | |

PK: `(rss_article_id, model_name)`

### `rss_clustering_eval_runs`

| カラム | 型 | 説明 |
|-------|----|----|
| `run_id` | TEXT (PK) | `{unix秒}-{hex}` |
| `article_count` | INT | `-limit` の値 |
| `threshold` | DOUBLE PRECISION | デフォルト閾値（モデル別は `params` 側） |
| `note` | TEXT | `-note` |
| `params` | JSONB | `{note, threshold, summaries: []}` |
| `created_at` | TIMESTAMPTZ | |

> 現状 `params` にはモデル別閾値 (`-thresholds`) は保存されていない。再現性のため記録したい場合は `SaveRun()` の改修が必要。

### `rss_clustering_eval`

| カラム | 型 | 説明 |
|-------|----|----|
| `run_id` | TEXT | FK → runs（CASCADE） |
| `model_name` | TEXT | |
| `rss_article_id` | TEXT | FK → `rss_articles(id)`（CASCADE） |
| `cluster_id` | INT | `GroupArticles` 戻り値配列の index |
| `created_at` | TIMESTAMPTZ | |

PK: `(run_id, model_name, rss_article_id)`

> `rss_articles` の削除でクラスタ割当が消える。記事が古くなって retention で消えると過去runの分布集計も復元できなくなる点に注意（サマリーは `params` に残るが、バケット分布は SQL集計が必要なので失われる）。

## 出力

完了時、stdout に `Result` を JSON でインデント出力：

```json
{
  "run_id": "1777487643-2f47fe997091",
  "created_at": "2026-04-29T18:34:04Z",
  "models": [
    {
      "model_name": "e5",
      "cluster_count": 106,
      "noise_ratio": 0.126,
      "mean_cluster_size": 4.72,
      "max_cluster_size": 78,
      "mean_avg_similarity": 0.9825
    }
  ]
}
```

## 関連

- 結果分析: `.claude/skills/compare-eval-models/SKILL.md`
- クラスタリング本体: `batch/internal/pipeline/steps/group.go`（`GroupArticles`）
- 本番との差分:
  - 本番は単一モデル（e5）固定 + `query: ` prefix
  - eval は複数モデル並列 + 各モデル個別 prefix
  - クラスタリングアルゴリズム自体は共通（`steps.GroupArticles`）
