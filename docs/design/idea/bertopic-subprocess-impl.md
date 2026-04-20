# BERTopic サブプロセス実装設計

## 概要

現行の `GroupArticles`（貪欲コサイン類似度）を、Python サブプロセス経由の BERTopic（UMAP + HDBSCAN）に置き換える。
Go 側は `exec.CommandContext` で Python スクリプトを呼び出し、stdin/stdout で JSON をやり取りする。

## アーキテクチャ

```
pipeline.go
  ├── Collect
  ├── Embed (ruri-v3, Go)
  ├── Classify (Go)
  ├── Group ← Python サブプロセスに置換
  │     Go: steps.GroupArticlesBERTopic(ctx, articles, cfg)
  │       └── exec.CommandContext("python3", "scripts/bertopic_cluster.py")
  │             stdin:  [{"id":"...", "embedding":[0.1, ...]}]
  │             stdout: {"clusters":[{"article_ids":["a","b"]}, ...], "noise_ids":["c"]}
  ├── Refine (LLM, Go — そのまま維持)
  ├── Name (Go)
  └── Store (Go)
```

## ファイル構成

```
batch/
  internal/pipeline/steps/
    group.go              ← 既存（フォールバック用に残す）
    group_bertopic.go     ← 新規: サブプロセス呼び出し
scripts/
  bertopic_cluster.py     ← 新規: BERTopic 実行
  requirements.txt        ← 新規: Python 依存
```

---

## Go 側: `group_bertopic.go`

### インターフェース

```go
// GroupArticlesBERTopic は Python サブプロセスで BERTopic クラスタリングを実行する。
// フォールバック: Python 実行失敗時は既存の GroupArticles にフォールバック。
func GroupArticlesBERTopic(ctx context.Context, articles []db.Article, cfg BERTopicConfig) []Cluster
```

### 設定

```go
type BERTopicConfig struct {
    PythonPath      string  // デフォルト: "python3"
    ScriptPath      string  // デフォルト: "scripts/bertopic_cluster.py"
    MinClusterSize  int     // HDBSCAN min_cluster_size, デフォルト: 3
    UMAPComponents  int     // UMAP n_components, デフォルト: 5
    TimeoutSec      int     // サブプロセスタイムアウト, デフォルト: 120
}
```

環境変数マッピング:

| 環境変数 | フィールド | デフォルト |
|:--|:--|:--|
| `BERTOPIC_PYTHON_PATH` | PythonPath | `python3` |
| `BERTOPIC_SCRIPT_PATH` | ScriptPath | `scripts/bertopic_cluster.py` |
| `BERTOPIC_MIN_CLUSTER_SIZE` | MinClusterSize | `3` |
| `BERTOPIC_UMAP_COMPONENTS` | UMAPComponents | `5` |
| `BERTOPIC_TIMEOUT_SEC` | TimeoutSec | `120` |

### stdin/stdout プロトコル

**Go → Python (stdin):**

```json
{
  "articles": [
    {"id": "uuid-1", "embedding": [0.012, -0.034, ...]},
    {"id": "uuid-2", "embedding": [0.056, 0.078, ...]}
  ],
  "params": {
    "min_cluster_size": 3,
    "umap_n_components": 5
  }
}
```

- `embedding` のない記事はGo側で除外し、後で単独クラスタとして追加する（現行と同じ挙動）

**Python → Go (stdout):**

```json
{
  "clusters": [
    {"article_ids": ["uuid-1", "uuid-2"]},
    {"article_ids": ["uuid-5", "uuid-6", "uuid-7"]}
  ],
  "noise_ids": ["uuid-3", "uuid-4"]
}
```

- `noise_ids`: HDBSCAN がノイズ（-1ラベル）と判定した記事。Go 側で各記事を単独クラスタにする

### Go 実装の骨格

```go
func GroupArticlesBERTopic(ctx context.Context, articles []db.Article, cfg BERTopicConfig) []Cluster {
    // 1. embedding ありの記事を抽出
    var withEmbed []db.Article
    var noEmbed []db.Article
    idxMap := make(map[string]db.Article)
    for _, a := range articles {
        if len(a.Embedding) > 0 {
            withEmbed = append(withEmbed, a)
            idxMap[a.ID] = a
        } else {
            noEmbed = append(noEmbed, a)
        }
    }

    // 2. stdin JSON 構築
    input := buildInput(withEmbed, cfg)
    inputJSON, _ := json.Marshal(input)

    // 3. サブプロセス実行
    timeout := time.Duration(cfg.TimeoutSec) * time.Second
    ctx2, cancel := context.WithTimeout(ctx, timeout)
    defer cancel()

    cmd := exec.CommandContext(ctx2, cfg.PythonPath, cfg.ScriptPath)
    cmd.Stdin = bytes.NewReader(inputJSON)
    var stdout, stderr bytes.Buffer
    cmd.Stdout = &stdout
    cmd.Stderr = &stderr

    if err := cmd.Run(); err != nil {
        slog.Warn("bertopic: subprocess failed, falling back to greedy",
            "err", err, "stderr", stderr.String())
        return GroupArticles(articles, cfg.FallbackThreshold)
    }

    // 4. stdout JSON パース
    var result bertopicOutput
    if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
        slog.Warn("bertopic: JSON parse failed, falling back", "err", err)
        return GroupArticles(articles, cfg.FallbackThreshold)
    }

    // 5. Cluster 構造体に変換
    clusters := buildClusters(result, idxMap)

    // 6. ノイズ記事を単独クラスタに
    for _, id := range result.NoiseIDs {
        if a, ok := idxMap[id]; ok {
            clusters = append(clusters, Cluster{
                Centroid: a.Embedding,
                Articles: []db.Article{a},
                DomCate:  a.Category,
            })
        }
    }

    // 7. embedding なしの記事も単独クラスタに
    for _, a := range noEmbed {
        clusters = append(clusters, Cluster{
            Articles: []db.Article{a},
            DomCate:  a.Category,
        })
    }

    return clusters
}
```

### エラー時フォールバック

Python 実行失敗時（プロセスエラー、タイムアウト、JSON パースエラー）は既存の `GroupArticles` にフォールバックする。パイプライン全体が止まらない。

---

## Python 側: `scripts/bertopic_cluster.py`

```python
#!/usr/bin/env python3
"""BERTopic clustering subprocess for NewsPrism batch pipeline.

stdin:  JSON {"articles": [{"id": str, "embedding": [float]}], "params": {...}}
stdout: JSON {"clusters": [{"article_ids": [str]}], "noise_ids": [str]}
stderr: ログ出力（Go 側でキャプチャ）
"""

import json
import sys

import numpy as np
from hdbscan import HDBSCAN
from umap import UMAP


def main():
    data = json.load(sys.stdin)
    articles = data["articles"]
    params = data.get("params", {})

    ids = [a["id"] for a in articles]
    embeddings = np.array([a["embedding"] for a in articles], dtype=np.float32)

    min_cluster_size = params.get("min_cluster_size", 3)
    n_components = params.get("umap_n_components", 5)

    # 記事数が少なすぎる場合は UMAP をスキップ
    if len(ids) < n_components + 2:
        reduced = embeddings
    else:
        umap_model = UMAP(
            n_components=n_components,
            metric="cosine",
            random_state=42,
        )
        reduced = umap_model.fit_transform(embeddings)

    hdbscan_model = HDBSCAN(
        min_cluster_size=min_cluster_size,
        metric="euclidean",  # UMAP 後はユークリッド距離が適切
    )
    labels = hdbscan_model.fit_predict(reduced)

    # ラベルごとにグループ化
    clusters = {}
    noise_ids = []
    for i, label in enumerate(labels):
        if label == -1:
            noise_ids.append(ids[i])
        else:
            clusters.setdefault(label, []).append(ids[i])

    output = {
        "clusters": [{"article_ids": aids} for aids in clusters.values()],
        "noise_ids": noise_ids,
    }
    json.dump(output, sys.stdout)


if __name__ == "__main__":
    main()
```

### Python 依存 (`scripts/requirements.txt`)

```
umap-learn>=0.5,<1.0
hdbscan>=0.8,<1.0
numpy>=1.24,<3.0
```

---

## pipeline.go の変更

```go
// 4. group
slog.Info("pipeline: group start")
articles, err := db.GetRecentEmbeddedArticles(ctx, pool)
if err != nil {
    return partialResult(start, "get articles failed: "+err.Error())
}

var clusters []steps.Cluster
if cfg.UseBERTopic {
    clusters = steps.GroupArticlesBERTopic(ctx, articles, cfg.BERTopicConfig)
} else {
    clusters = steps.GroupArticles(articles, cfg.GroupClusterThreshold)
}
```

### config 追加

```go
type Config struct {
    // ...既存フィールド...
    UseBERTopic    bool           // USE_BERTOPIC=true で有効化
    BERTopicConfig steps.BERTopicConfig
}
```

`USE_BERTOPIC=false` がデフォルト。既存動作に影響なし。

---

## Refine ステップとの関係

BERTopic 導入後も **Refine はそのまま維持する**。

- HDBSCAN はembedding空間の密度だけで判断するため、ニュース記事の「トピック的一貫性」まではカバーしない
- LLM Refine はタイトルを読んで意味的な判断ができるため、HDBSCAN の弱点を補完する
- ただし BERTopic の方がクラスタ品質が高ければ、Refine の suspect 数が減り LLM コストが下がる

---

## テスト戦略

### Go 側

```go
func TestGroupArticlesBERTopic_Fallback(t *testing.T) {
    // Python が見つからない場合に GroupArticles にフォールバックすることを確認
    cfg := BERTopicConfig{PythonPath: "/nonexistent/python3"}
    clusters := GroupArticlesBERTopic(context.Background(), testArticles, cfg)
    assert(len(clusters) > 0)
}

func TestGroupArticlesBERTopic_ParseOutput(t *testing.T) {
    // Python stdout のJSONパースを確認（モック不要、固定JSONで）
}
```

### Python 側

```bash
echo '{"articles":[{"id":"a","embedding":[0.1,0.2,0.3]},{"id":"b","embedding":[0.1,0.2,0.31]},{"id":"c","embedding":[0.9,0.8,0.7]}],"params":{"min_cluster_size":2,"umap_n_components":2}}' \
  | python3 scripts/bertopic_cluster.py
```

### 統合テスト

実際のパイプラインで `USE_BERTOPIC=true` と `false` を比較し、クラスタ品質（Refine の suspect 率）を比較。

---

## デプロイ

### ローカル開発

```bash
cd scripts && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
```

`BERTOPIC_PYTHON_PATH=scripts/.venv/bin/python3` を `.env.local` に設定。

### Docker

```dockerfile
# Python 依存レイヤー
FROM python:3.12-slim AS python-deps
COPY scripts/requirements.txt /tmp/
RUN pip install --no-cache-dir -r /tmp/requirements.txt

# 最終イメージ
FROM golang:1.24 AS runtime
COPY --from=python-deps /usr/local/lib/python3.12 /usr/local/lib/python3.12
COPY --from=python-deps /usr/local/bin/python3 /usr/local/bin/python3
COPY scripts/ /app/scripts/
```

---

## パラメータチューニング指針

| パラメータ | 推奨初期値 | 調整の方向 |
|:--|:--|:--|
| `min_cluster_size` | 3 | ノイズが多すぎる → 2 に下げる。巨大クラスタが多い → 5 に上げる |
| `umap_n_components` | 5 | クラスタが分離しない → 10 に上げる。記事数が少ない → 3 に下げる |
| `umap_metric` | `cosine` | ruri-v3 の埋め込みはコサイン距離前提なので変更不要 |
| `hdbscan_metric` | `euclidean` | UMAP 後空間ではユークリッドが適切。UMAP なしなら `cosine` に変更 |

---

## 段階的導入計画

1. **`scripts/bertopic_cluster.py` + `requirements.txt` を追加** — 単体で動作確認
2. **`group_bertopic.go` を実装** — フォールバック付き
3. **`config.go` に `UseBERTopic` フラグ追加** — デフォルト `false`
4. **`pipeline.go` に分岐追加** — `USE_BERTOPIC=true` で切り替え
5. **比較検証** — 同じ記事セットで greedy vs BERTopic の結果を比較
6. **デフォルト切り替え** — 品質に問題なければ `USE_BERTOPIC=true` をデフォルトに
