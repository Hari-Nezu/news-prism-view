# Go API Server 設計書

Next.js API Routes を Go API サーバーに移行する。Go workspace で batch と共通コードを共有する。

## ディレクトリ構成

```
news-prism-view/
├── go.work                    # Go workspace 定義
├── shared/                    # 共通モジュール (module github.com/newsprism/shared)
│   ├── go.mod
│   ├── db/
│   │   ├── pool.go            # ← batch/internal/db/pool.go を移動
│   │   ├── articles.go        # ← batch/internal/db/articles.go を移動 + 読み取り系追加
│   │   ├── snapshots.go       # ← batch/internal/db/snapshots.go を移動 + 読み取り系追加
│   │   ├── compare.go         # NEW: compare_sessions, compare_results クエリ
│   │   ├── youtube.go         # NEW: youtube_videos クエリ
│   │   ├── feed_groups.go     # NEW: feed_groups クエリ
│   │   └── helpers.go         # nullStr, parseVectorStr 等のユーティリティ
│   ├── llm/
│   │   ├── chat.go            # ← batch/internal/llm/chat.go を移動
│   │   └── embed.go           # ← batch/internal/llm/embed.go を移動
│   ├── taxonomy/
│   │   └── taxonomy.go        # ← batch/internal/taxonomy/taxonomy.go を移動
│   └── config/
│       └── config.go          # 共通設定（DB URL, LLM URL, モデル名）
│
├── batch/                     # 既存バッチ (module github.com/newsprism/batch)
│   ├── go.mod                 # shared を require
│   ├── cmd/newsprism-batch/main.go
│   └── internal/
│       ├── pipeline/          # batch 固有ロジック（変更なし）
│       ├── config/
│       │   └── feeds.go       # FeedConfig, LoadFeeds（batch固有）
│       └── rss/               # batch 固有の RSS パーサー
│
├── server/                    # 新 API サーバー (module github.com/newsprism/server)
│   ├── go.mod                 # shared を require
│   ├── cmd/newsprism-server/main.go
│   └── internal/
│       ├── handler/           # HTTP ハンドラ（ルートごとに1ファイル）
│       │   ├── batch.go       # /api/batch/*
│       │   ├── config.go      # /api/config
│       │   ├── feed_groups.go # /api/feed-groups
│       │   ├── history.go     # /api/history, /api/history/similar
│       │   ├── rss.go         # /api/rss
│       │   ├── youtube.go     # /api/youtube/*
│       │   ├── analyze.go     # /api/analyze
│       │   ├── classify.go    # /api/classify
│       │   ├── compare.go     # /api/compare, /api/compare/analyze
│       │   └── article.go     # /api/fetch-article
│       ├── middleware/
│       │   └── cors.go        # CORS（Next.js → Go API 間）
│       ├── rss/               # RSS フィード取得・フィルタリング
│       │   ├── parser.go
│       │   └── filter.go
│       ├── youtube/           # YouTube フィード取得・字幕取得
│       │   └── feed.go
│       ├── scraper/           # 記事本文スクレイピング（cheerio → goquery）
│       │   └── fetcher.go
│       ├── analyzer/          # LLM 分析（3軸スコアリング）
│       │   └── analyzer.go
│       ├── classifier/        # LLM カテゴリ分類
│       │   └── classifier.go
│       └── sse/               # SSE ストリーミングヘルパー
│           └── writer.go
│
└── src/                       # Next.js（フロント専用に縮小）
```

## go.work

```go
go 1.22

use (
    ./shared
    ./batch
    ./server
)
```

## shared モジュールの設計

### shared/config/config.go

batch と server で共通の設定値。batch 固有の設定（FeedsYAMLPath 等）は batch 側に残す。

```go
package config

type SharedConfig struct {
    DatabaseURL  string
    LLMBaseURL   string
    EmbedBaseURL string
    LLMModel     string
    ClassifyModel string
    EmbedModel   string
}

func LoadShared() SharedConfig { /* 環境変数から読む */ }
```

### shared/db/ — 追加が必要なクエリ

既存の batch/internal/db をそのまま移動し、以下を追加する：

| 関数名 | 対応する TS 関数 | 用途 |
|---|---|---|
| `GetLatestSnapshotWithGroups` | `getLatestSnapshot` | スナップショット + グループ + アイテム一括取得 |
| `GetSnapshotHistory` | `getSnapshotHistory` | 直近スナップショット一覧 |
| `GetSnapshotGroupDetail` | `getSnapshotGroupDetail` | グループ詳細 |
| `GetSnapshotGroupsForRecompute` | `getSnapshotGroupsForRecompute` | 再計算用全グループ取得 |
| `GetRssArticleEmbeddingMap` | `getRssArticleEmbeddingMap` | URL→embedding マップ |
| `GetRecentArticles` | `getRecentArticles` | 分析済み記事一覧 |
| `GetRecentCompareSessions` | `getRecentCompareSessions` | 比較セッション一覧 |
| `FindSimilarArticles` | `findSimilarArticles` | embedding コサイン距離検索 |
| `SaveArticle` | `saveArticle` | 分析結果 + embedding 保存 |
| `SaveCompareSession` | `saveCompareSession` | 比較セッション保存 |
| `SaveCompareResults` | `saveCompareResults` | 比較分析結果保存 |
| `SaveYouTubeVideo` | `saveYouTubeVideo` | YouTube 動画分析保存 |
| `GetFeedGroupsWithItems` | `getFeedGroupsWithItems` | フィードグループ設定取得 |
| `UpsertRssArticles` | `upsertRssArticles` | 記事 upsert（既存を移動） |
| `SaveNewsGroupRecords` | `saveNewsGroupRecords` | ニュースグループレコード保存 |

## server モジュールの設計

### cmd/newsprism-server/main.go

```go
package main

import (
    "context"
    "log/slog"
    "net/http"
    "os"
    "os/signal"
    "syscall"

    "github.com/newsprism/shared/config"
    "github.com/newsprism/shared/db"
    "github.com/newsprism/shared/llm"
    "github.com/newsprism/server/internal/handler"
    "github.com/newsprism/server/internal/middleware"
)

func main() {
    cfg := config.LoadShared()
    ctx := context.Background()

    pool, _ := db.NewPool(ctx, cfg.DatabaseURL)
    defer pool.Close()

    chatClient := llm.NewChatClient(cfg.LLMBaseURL, cfg.LLMModel)
    classifyClient := llm.NewChatClient(cfg.LLMBaseURL, cfg.ClassifyModel)
    embedClient := llm.NewEmbedClient(cfg.EmbedBaseURL, cfg.EmbedModel)

    deps := &handler.Deps{
        Pool:           pool,
        ChatClient:     chatClient,
        ClassifyClient: classifyClient,
        EmbedClient:    embedClient,
        Config:         cfg,
        BatchServerURL: os.Getenv("BATCH_SERVER_URL"),
    }

    mux := http.NewServeMux()
    handler.Register(mux, deps)

    srv := &http.Server{
        Addr:    ":" + getEnv("API_PORT", "8091"),
        Handler: middleware.CORS(mux),
    }

    go srv.ListenAndServe()

    sig := make(chan os.Signal, 1)
    signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
    <-sig
    srv.Shutdown(ctx)
}
```

### handler/deps.go — 依存注入

```go
package handler

import (
    "github.com/newsprism/shared/config"
    "github.com/newsprism/shared/db"
    "github.com/newsprism/shared/llm"
)

type Deps struct {
    Pool           *db.Pool
    ChatClient     *llm.ChatClient
    ClassifyClient *llm.ChatClient
    EmbedClient    *llm.EmbedClient
    Config         config.SharedConfig
    BatchServerURL string
}
```

### handler/register.go — ルーティング

```go
package handler

import "net/http"

func Register(mux *http.ServeMux, d *Deps) {
    // Batch
    mux.HandleFunc("GET /api/batch/latest",            d.BatchLatest)
    mux.HandleFunc("GET /api/batch/history",            d.BatchHistory)
    mux.HandleFunc("POST /api/batch/run",               d.BatchRun)
    mux.HandleFunc("GET /api/batch/inspect",            d.BatchInspect)
    mux.HandleFunc("POST /api/batch/inspect/recompute", d.BatchInspectRecompute)

    // Config
    mux.HandleFunc("GET /api/config", d.Config_)

    // Feed Groups
    mux.HandleFunc("GET /api/feed-groups", d.FeedGroups)

    // History
    mux.HandleFunc("GET /api/history",          d.History)
    mux.HandleFunc("POST /api/history/similar",  d.HistorySimilar)

    // RSS
    mux.HandleFunc("GET /api/rss", d.RSS)

    // YouTube
    mux.HandleFunc("GET /api/youtube/feed",     d.YouTubeFeed)
    mux.HandleFunc("POST /api/youtube/analyze",  d.YouTubeAnalyze)

    // Analyze / Classify
    mux.HandleFunc("POST /api/analyze",  d.Analyze)
    mux.HandleFunc("POST /api/classify", d.Classify)

    // Compare
    mux.HandleFunc("GET /api/compare",          d.Compare)
    mux.HandleFunc("POST /api/compare/analyze",  d.CompareAnalyze)

    // Fetch Article
    mux.HandleFunc("POST /api/fetch-article", d.FetchArticle)
}
```

### ハンドラ実装例

#### handler/batch.go（単純な例）

```go
package handler

import (
    "encoding/json"
    "net/http"

    "github.com/newsprism/shared/db"
)

func (d *Deps) BatchLatest(w http.ResponseWriter, r *http.Request) {
    snap, err := db.GetLatestSnapshotWithGroups(r.Context(), d.Pool)
    if err != nil {
        writeError(w, "スナップショット取得に失敗しました", 500)
        return
    }
    writeJSON(w, snap)
}

func (d *Deps) BatchHistory(w http.ResponseWriter, r *http.Request) {
    history, err := db.GetSnapshotHistory(r.Context(), d.Pool)
    if err != nil {
        writeError(w, "履歴取得に失敗しました", 500)
        return
    }
    writeJSON(w, map[string]any{"history": history})
}

func (d *Deps) BatchRun(w http.ResponseWriter, r *http.Request) {
    resp, err := http.Post(d.BatchServerURL+"/run", "", nil)
    if err != nil || resp.StatusCode != 200 {
        writeError(w, "バッチサーバーに接続できませんでした", 502)
        return
    }
    defer resp.Body.Close()
    writeJSON(w, map[string]bool{"ok": true})
}
```

#### handler/analyze.go（SSE の例）

```go
package handler

import (
    "encoding/json"
    "net/http"

    "github.com/newsprism/server/internal/analyzer"
    "github.com/newsprism/server/internal/classifier"
    "github.com/newsprism/server/internal/sse"
)

type AnalyzeRequest struct {
    Title      string `json:"title"`
    Content    string `json:"content"`
    URL        string `json:"url,omitempty"`
    Source     string `json:"source,omitempty"`
    MultiModel bool   `json:"multiModel,omitempty"`
}

func (d *Deps) Analyze(w http.ResponseWriter, r *http.Request) {
    var req AnalyzeRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        writeError(w, "入力データが不正です", 400)
        return
    }
    if req.Title == "" || len(req.Content) < 10 {
        writeError(w, "入力データが不正です", 400)
        return
    }

    if !req.MultiModel {
        // シングルモデル
        result, err := analyzer.Analyze(r.Context(), d.ChatClient, req.Title, req.Content)
        if err != nil {
            writeError(w, err.Error(), 500)
            return
        }
        cat := classifier.Classify(r.Context(), d.ClassifyClient, req.Title, result.Summary)

        // 非同期で embedding + DB保存
        go func() {
            // embed & save
        }()

        writeJSON(w, map[string]any{"analysis": result, "category": cat.Category, "subcategory": cat.Subcategory})
        return
    }

    // マルチモデル → SSE
    sw := sse.NewWriter(w)
    sw.Init()
    // ... モデルごとにループして sw.Send("model-result", data)
    sw.Send("done", map[string]any{})
}
```

### sse/writer.go

```go
package sse

import (
    "encoding/json"
    "fmt"
    "net/http"
)

type Writer struct {
    w       http.ResponseWriter
    flusher http.Flusher
}

func NewWriter(w http.ResponseWriter) *Writer {
    f, _ := w.(http.Flusher)
    return &Writer{w: w, flusher: f}
}

func (s *Writer) Init() {
    s.w.Header().Set("Content-Type", "text/event-stream")
    s.w.Header().Set("Cache-Control", "no-cache")
    s.w.Header().Set("Connection", "keep-alive")
}

func (s *Writer) Send(event string, data any) {
    b, _ := json.Marshal(data)
    fmt.Fprintf(s.w, "event: %s\ndata: %s\n\n", event, b)
    if s.flusher != nil {
        s.flusher.Flush()
    }
}
```

### middleware/cors.go

```go
package middleware

import "net/http"

func CORS(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Access-Control-Allow-Origin", "*")
        w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
        if r.Method == "OPTIONS" {
            w.WriteHeader(204)
            return
        }
        next.ServeHTTP(w, r)
    })
}
```

### handler/helpers.go

```go
package handler

import (
    "encoding/json"
    "net/http"
)

func writeJSON(w http.ResponseWriter, v any) {
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, msg string, code int) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(code)
    json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
```

## server で新規実装が必要な機能

TS の lib を Go に移植する必要があるもの：

### 1. server/internal/rss/parser.go

TS の `src/lib/rss-parser.ts` に対応。

- `gofeed` ライブラリ使用（batch で既に利用中）
- `FeedConfig` はフロント用設定ファイルから読む or Go 側にも定義
- `fetchAllDefaultFeeds(enabledIds?)` → RSS 並行取得
- `fetchRssFeed(url, name)` → 個別取得
- 既存 `batch/internal/rss/parser.go` と重複する部分は shared に抽出検討

### 2. server/internal/rss/filter.go

TS の `src/lib/compare-filter.ts` に対応。

- `filterByKeyword(items, keyword)` — タイトル/概要にキーワードを含む記事を抽出

### 3. server/internal/youtube/feed.go

TS の `src/lib/youtube-feed.ts` に対応。

- YouTube チャンネルの RSS フィード取得（`https://www.youtube.com/feeds/videos.xml?channel_id=...`）
- `extractVideoId(url)` — URL から video ID を抽出
- `fetchTranscript(videoId)` — YouTube 字幕 API（外部サービス or innertube API）
- チャンネル設定は `src/lib/config/youtube-channel-configs.ts` から Go 定数に移植

### 4. server/internal/scraper/fetcher.go

TS の `src/lib/article-fetcher.ts` に対応。

- `fetchArticleFromUrl(url)` — URL から記事本文をスクレイプ
- `goquery` ライブラリ使用（cheerio 相当）
- SSRF 対策: プライベート IP への接続を拒否（`validatePublicUrl` の移植）

### 5. server/internal/analyzer/analyzer.go

TS の `src/lib/ollama.ts` に対応。

- `Analyze(ctx, client, title, content)` — LLM で 3 軸スコアリング
- `AnalyzeMultiModel(ctx, clients, title, content)` — 複数モデルで分析（SSE 用）
- システムプロンプトは TS 版と同一テキスト
- JSON レスポンスをパースして `AnalysisResult` 構造体に変換

### 6. server/internal/classifier/classifier.go

TS の `src/lib/news-classifier-llm.ts` に対応。

- `Classify(ctx, client, title, summary)` — LLM でカテゴリ分類
- `shared/taxonomy` を使って分類ガイドを生成 → LLM に渡す
- `ClassifyBatch(ctx, client, articles)` — バッチ分類

### 7. server/internal/grouper/grouper.go

TS の `src/lib/news-grouper.ts` に対応。

- `GroupArticlesByEvent(items)` — 記事をイベントごとにグルーピング
- LLM を使った意味的グルーピング or embedding ベースのクラスタリング

## 移行手順（フェーズ）

### Phase 1: Go workspace + shared モジュール作成

1. `go.work` を作成
2. `shared/` モジュールを作成
3. `batch/internal/db/`, `batch/internal/llm/`, `batch/internal/taxonomy/` を `shared/` にコピー
4. `batch/` の import を `shared/` に変更
5. `batch` がビルド・テスト通ることを確認

### Phase 2: server スケルトン + 単純なハンドラ

1. `server/` モジュールを作成（main.go, deps, register, helpers, cors）
2. 単純な GET ハンドラを実装:
   - `GET /api/batch/latest`
   - `GET /api/batch/history`
   - `GET /api/batch/inspect`
   - `POST /api/batch/run`（プロキシ）
   - `GET /api/config`
   - `GET /api/feed-groups`
   - `GET /api/history`
3. shared/db に必要な読み取り関数を追加
4. 動作確認

### Phase 3: embedding 検索 + 記事取得

1. `POST /api/history/similar` — embedding 類似検索
2. `GET /api/rss` — RSS フィード取得
3. `GET /api/youtube/feed` — YouTube フィード取得
4. `POST /api/fetch-article` — 記事スクレイプ
5. `POST /api/batch/inspect/recompute` — 再計算

### Phase 4: LLM 連携ハンドラ（SSE 含む）

1. `POST /api/classify`
2. `POST /api/analyze`（シングル + マルチモデル SSE）
3. `GET /api/compare`（キーワード検索 + グルーピング）
4. `POST /api/compare/analyze`（SSE）
5. `POST /api/youtube/analyze`（SSE）

### Phase 5: フロント切り替え + Next.js API Route 削除

1. Next.js のフロントで API URL を環境変数化（`NEXT_PUBLIC_API_URL`）
2. Go API サーバーに向ける
3. 動作確認後、`src/app/api/` を削除
4. `src/lib/` のサーバーサイド専用コード（db.ts, ollama.ts 等）を削除

## Next.js 側の変更

フロントから Go API を呼ぶように `fetch` の URL を変更するだけ。

```ts
// 変更前
const res = await fetch("/api/batch/latest");

// 変更後
const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/batch/latest`);
```

SSE エンドポイントも同様に URL を差し替えるだけで動作する（EventSource の URL を変更）。

## 外部ライブラリ（server/go.mod に追加）

| ライブラリ | 用途 |
|---|---|
| `github.com/mmcdole/gofeed` | RSS パーサー（batch と同じ） |
| `github.com/PuerkitoBio/goquery` | HTML スクレイピング（cheerio 相当） |
| `github.com/jackc/pgx/v5` | PostgreSQL（shared 経由） |
| `github.com/pgvector/pgvector-go` | pgvector（shared 経由） |

標準ライブラリだけで足りるもの: HTTP サーバー、JSON、SSE、CORS。ルーターも `net/http` の Go 1.22 パターンマッチで十分。

## Docker 構成の変更

### 現状

- `Dockerfile` — Next.js のマルチステージビルド（deps → builder → migrate → runner）
- `docker-compose.yml` — `app`（Next.js）+ `ollama` + `db`（pgvector）
- `docker-compose.local-ollama.yml` — ホストの Ollama を使う構成
- `docker-compose.dev.yml` / `docker-compose.local-ollama.dev.yml` — 開発用オーバーライド
- batch の Dockerfile / compose サービスは**存在しない**（ホストで直接実行している）

### 追加するファイル

#### Dockerfile.go（batch + server 共用マルチステージ）

```dockerfile
# ── ビルドステージ ──
FROM golang:1.22-alpine AS builder
WORKDIR /workspace

# go.work と各モジュールの go.mod/go.sum を先にコピー（キャッシュ効率）
COPY go.work go.work
COPY shared/go.mod shared/go.sum ./shared/
COPY batch/go.mod batch/go.sum ./batch/
COPY server/go.mod server/go.sum ./server/
RUN cd shared && go mod download && \
    cd ../batch && go mod download && \
    cd ../server && go mod download

# ソースコピー & ビルド
COPY shared/ ./shared/
COPY batch/ ./batch/
COPY server/ ./server/

RUN CGO_ENABLED=0 go build -o /bin/newsprism-batch ./batch/cmd/newsprism-batch
RUN CGO_ENABLED=0 go build -o /bin/newsprism-server ./server/cmd/newsprism-server

# ── batch ランタイム ──
FROM alpine:3.20 AS batch
RUN apk add --no-cache ca-certificates tzdata
COPY --from=builder /bin/newsprism-batch /usr/local/bin/newsprism-batch
COPY batch/feeds.yaml /etc/newsprism/feeds.yaml
ENV FEEDS_YAML_PATH=/etc/newsprism/feeds.yaml
EXPOSE 8090
CMD ["newsprism-batch", "serve"]

# ── server ランタイム ──
FROM alpine:3.20 AS server
RUN apk add --no-cache ca-certificates tzdata curl
COPY --from=builder /bin/newsprism-server /usr/local/bin/newsprism-server
EXPOSE 8091
HEALTHCHECK --interval=10s --timeout=3s CMD curl -f http://localhost:8091/api/health || exit 1
CMD ["newsprism-server"]
```

> batch と server を 1 つの Dockerfile でマルチステージビルドする。
> Go workspace なので `go.work` をコンテキストに含める必要がある（ビルドコンテキスト = プロジェクトルート）。

#### docker-compose.yml への追加

```yaml
services:
  # ... 既存の db, db-migrate, ollama, ollama-init ...

  batch:
    build:
      context: .
      dockerfile: Dockerfile.go
      target: batch
    environment:
      - DATABASE_URL=postgresql://newsprism:newsprism@db:5432/newsprism
      - LLM_BASE_URL=${LLM_BASE_URL:-http://ollama:11434}
      - EMBED_BASE_URL=${LLM_BASE_URL:-http://ollama:11434}
      - LLM_MODEL=${LLM_MODEL:-gemma-4-E4B-it-Q8_0}
      - CLASSIFY_MODEL=${CLASSIFY_MODEL:-gemma-4-E4B-it-Q8_0}
      - EMBED_MODEL=${EMBED_MODEL:-Targoyle/ruri-v3-310m-GGUF:Q8_0}
    depends_on:
      db-migrate:
        condition: service_completed_successfully
    restart: unless-stopped

  api:
    build:
      context: .
      dockerfile: Dockerfile.go
      target: server
    ports:
      - "8091:8091"
    environment:
      - DATABASE_URL=postgresql://newsprism:newsprism@db:5432/newsprism
      - LLM_BASE_URL=${LLM_BASE_URL:-http://ollama:11434}
      - EMBED_BASE_URL=${LLM_BASE_URL:-http://ollama:11434}
      - LLM_MODEL=${LLM_MODEL:-gemma-4-E4B-it-Q8_0}
      - CLASSIFY_MODEL=${CLASSIFY_MODEL:-gemma-4-E4B-it-Q8_0}
      - EMBED_MODEL=${EMBED_MODEL:-Targoyle/ruri-v3-310m-GGUF:Q8_0}
      - API_PORT=8091
      - BATCH_SERVER_URL=http://batch:8090
    depends_on:
      db-migrate:
        condition: service_completed_successfully
    restart: unless-stopped

  app:
    # ... 既存 ...
    environment:
      # API Route 削除後は Go API サーバーを使う
      - NEXT_PUBLIC_API_URL=http://api:8091
      # DB接続は不要になる（Phase 5 完了後に削除可）
      - DATABASE_URL=postgresql://newsprism:newsprism@db:5432/newsprism
```

#### docker-compose.local-ollama.yml への追加

ホスト Ollama 構成にも同様に `batch` と `api` サービスを追加。
`LLM_BASE_URL` を `http://host-gateway:8080` に設定し、`extra_hosts` を付与する。

```yaml
  batch:
    build:
      context: .
      dockerfile: Dockerfile.go
      target: batch
    environment:
      - DATABASE_URL=postgresql://newsprism:newsprism@db:5432/newsprism
      - LLM_BASE_URL=${LLM_BASE_URL:-http://host-gateway:8080}
      - EMBED_BASE_URL=${LLM_BASE_URL:-http://host-gateway:8080}
      - LLM_MODEL=${LLM_MODEL:-gemma-4-E4B-it-Q8_0}
      - CLASSIFY_MODEL=${CLASSIFY_MODEL:-gemma-4-E4B-it-Q8_0}
      - EMBED_MODEL=${EMBED_MODEL:-Targoyle/ruri-v3-310m-GGUF:Q8_0}
    extra_hosts:
      - "host-gateway:host-gateway"
    depends_on:
      db-migrate:
        condition: service_completed_successfully
    restart: unless-stopped

  api:
    build:
      context: .
      dockerfile: Dockerfile.go
      target: server
    ports:
      - "8091:8091"
    environment:
      - DATABASE_URL=postgresql://newsprism:newsprism@db:5432/newsprism
      - LLM_BASE_URL=${LLM_BASE_URL:-http://host-gateway:8080}
      - EMBED_BASE_URL=${LLM_BASE_URL:-http://host-gateway:8080}
      - LLM_MODEL=${LLM_MODEL:-gemma-4-E4B-it-Q8_0}
      - CLASSIFY_MODEL=${CLASSIFY_MODEL:-gemma-4-E4B-it-Q8_0}
      - EMBED_MODEL=${EMBED_MODEL:-Targoyle/ruri-v3-310m-GGUF:Q8_0}
      - API_PORT=8091
      - BATCH_SERVER_URL=http://batch:8090
    extra_hosts:
      - "host-gateway:host-gateway"
    depends_on:
      db-migrate:
        condition: service_completed_successfully
    restart: unless-stopped
```

#### 開発用オーバーライド（docker-compose.dev.yml への追加）

Go サービスはホットリロードが不要（ホストで直接 `go run` する想定）なので、
dev 構成では Go サービスを**起動しない**。

```yaml
  # batch, api は dev では起動しない（ホストで go run）
  batch:
    profiles: ["go"]  # 明示的に --profile go を付けた時だけ起動

  api:
    profiles: ["go"]
```

### Docker 関連の移行手順

| フェーズ | やること |
|---|---|
| Phase 1 | `Dockerfile.go` を作成。`batch` と `api` サービスを compose に追加。この時点では `app`（Next.js）は既存のまま |
| Phase 2-4 | Go API ハンドラ実装中。`api` サービスは起動するが、フロントはまだ Next.js API Route を使う |
| Phase 5 | フロントの API URL を `NEXT_PUBLIC_API_URL` に切り替え。Next.js の `Dockerfile` から不要になったもの（Prisma 等）を削除。`app` の `DATABASE_URL` を削除 |

### ネットワーク構成（Phase 5 完了後）

```
[ブラウザ] → :3000 [Next.js app] → SSR/静的配信のみ
    ↓
[ブラウザ] → :8091 [Go api] → DB, LLM
                      ↓
               :8090 [Go batch] → DB, LLM（cron + 手動トリガー）
                      ↓
               :5432 [PostgreSQL + pgvector]
```

> Next.js の SSR で Go API を叩くケース（Server Component から fetch）は、
> コンテナ間通信なので `http://api:8091` を使う。
> ブラウザからの直接 fetch は `http://localhost:8091`（or リバースプロキシ経由）。

## 設定・環境変数

| 変数名 | デフォルト | 用途 |
|---|---|---|
| `DATABASE_URL` | `postgresql://newsprism:newsprism@localhost:5432/newsprism` | DB接続 |
| `LLM_BASE_URL` | `http://127.0.0.1:8081` | LLM API |
| `EMBED_BASE_URL` | `http://127.0.0.1:8081` | 埋め込み API |
| `LLM_MODEL` | `gemma-4-E4B-it-Q8_0` | 分析モデル |
| `CLASSIFY_MODEL` | `gemma-4-E4B-it-Q8_0` | 分類モデル |
| `EMBED_MODEL` | `Targoyle/ruri-v3-310m-GGUF:Q8_0` | 埋め込みモデル |
| `API_PORT` | `8091` | API サーバーポート |
| `BATCH_SERVER_URL` | `http://127.0.0.1:8090` | batch サーバー URL |
| `BATCH_PORT` | `8090` | batch サーバーポート（既存） |
