# バッチパイプライン設計（Go 実装）

## 背景・動機

現状は全処理（RSS取得 → embedding → LLMグループ命名 → 分類）がリクエスト時にオンデマンド実行される。

**問題点:**
- ページ表示のたびに15社RSS取得 + embedding + LLM呼び出しが走る（数十秒〜数分）
- 同じ記事を何度も再処理する無駄
- LLM/embeddingサーバーの負荷が閲覧数に比例
- ユーザー体験: 待ち時間が長い
- 今後のニュース対象量増加に Node.js の並行処理だと厳しい

**目指す姿:**
- Go バイナリで定時バッチ処理。goroutine で並行フィード取得・embedding
- UIはDBから読むだけ → 即時表示
- Next.js はフロントエンド + 読み取りAPIのみに限定

---

## アーキテクチャ

```
┌──────────────────────────────────────────────┐
│  newsprism-batch (Go バイナリ)                 │
│                                              │
│  サブコマンド:                                 │
│    run      — パイプライン1回実行              │
│    serve    — HTTP + 内蔵cron スケジューラ     │
│                                              │
│  ┌─────────────────────────────────────────┐ │
│  │ collect → embed → classify → group →    │ │
│  │   name → dedup → store                  │ │
│  └─────────────────────────────────────────┘ │
└──────────────────────┬───────────────────────┘
                       │ pgx
           ┌───────────▼────────────┐
           │ PostgreSQL + pgvector  │
           └───────────▲────────────┘
                       │ Prisma（読み取りのみ）
┌──────────────────────┴───────────────────────┐
│  Next.js (フロントエンド)                      │
│    GET /api/batch/latest  — スナップショット取得│
│    GET /api/batch/history — 履歴一覧           │
│    既存の /api/analyze 等 — オンデマンド分析    │
└──────────────────────────────────────────────┘

           ┌───────────────────────┐
           │ llama.cpp サーバー     │
           │  :8081                │
           │  - embedding (ruri)   │
           │  - chat (gemma)       │
           └───────────────────────┘
```

---

## Go 技術スタック

| 用途 | ライブラリ | 理由 |
|------|-----------|------|
| HTTP | `net/http` + `go-chi/chi/v5` | 軽量、stdlib準拠 |
| DB | `jackc/pgx/v5` | PostgreSQL最速ドライバ |
| pgvector | `pgvector/pgvector-go` | `pgx` 統合済み |
| RSS | `mmcdole/gofeed` | 最も成熟した Go RSS パーサー |
| cron | `robfig/cron/v3` | `serve` モード用の内蔵スケジューラ |
| CLI | `spf13/cobra` or 標準 `flag` | サブコマンド管理 |
| 設定 | 環境変数 + YAML | フィード定義は YAML 共有ファイル |
| ログ | `log/slog` | Go 1.21+ 標準の構造化ログ |

---

## ディレクトリ構成

```
backend/
├── cmd/
│   └── newsprism-batch/
│       └── main.go              — エントリポイント（run / serve サブコマンド）
├── internal/
│   ├── config/
│   │   ├── config.go            — 環境変数読み込み
│   │   └── feeds.go             — フィード定義の読み込み（YAML）
│   ├── db/
│   │   ├── pool.go              — pgx コネクションプール初期化
│   │   ├── articles.go          — RssArticle CRUD
│   │   ├── snapshots.go         — ProcessedSnapshot CRUD
│   │   └── lock.go              — PostgreSQL advisory lock
│   ├── pipeline/
│   │   ├── pipeline.go          — オーケストレータ
│   │   ├── collect.go           — RSS 収集
│   │   ├── embed.go             — バッチ embedding
│   │   ├── classify.go          — LLM 分類（embedding → LLM カスケード）
│   │   ├── group.go             — グリーディクラスタリング
│   │   ├── name.go              — LLM グループ命名
│   │   ├── dedup.go             — embedding 類似度重複除去
│   │   └── store.go             — スナップショット保存
│   ├── llm/
│   │   ├── client.go            — llama.cpp OpenAI互換 HTTP クライアント
│   │   ├── embed.go             — /v1/embeddings ラッパー
│   │   └── chat.go              — /v1/chat/completions ラッパー
│   └── rss/
│       ├── parser.go            — gofeed ラッパー + Google News 対応
│       └── filter.go            — 政治・経済フィルタ
├── feeds.yaml                   — フィード定義（TypeScript 版と同期）
├── go.mod
└── go.sum
```

---

## パイプライン概要

```
[cron / CLI] → collect → embed → classify → group → name → dedup → store
                 ↓                                                   ↓
              RssArticle                                       ProcessedSnapshot
              (embedding保存)                                  ├─ SnapshotGroup
                                                               └─ SnapshotGroupItem
```

### ステージ

| # | ステージ | 処理内容 | Go の並行性 | 推定時間 |
|---|---------|---------|-----------|---------|
| 1 | **collect** | 全フィード RSS 並行取得、RssArticle upsert | goroutine × フィード数 | ~5s |
| 2 | **embed** | embedding 未計算記事のバッチ embedding | バッチAPI 1回（llama.cpp が並行処理） | ~20s/100件 |
| 3 | **classify** | category/subcategory 未分類記事の分類 | embedding分類は Go 内で完結、LLM フォールバックのみ API | ~30s/100件 |
| 4 | **group** | embedding コサイン類似度クラスタリング | Go 内で完結（CPU） | ~1s |
| 5 | **name** | LLM グループ命名 | 1回の API 呼び出し | ~10s |
| 6 | **dedup** | cosine > 0.95 の重複記事を除去 | Go 内で完結（CPU） | <1s |
| 7 | **store** | スナップショット保存 + 古いスナップショット削除 | トランザクション 1回 | ~2s |

合計: 1回あたり約1分（記事100件想定、collect の goroutine 並行で短縮）

---

## フィード定義の共有

TypeScript の `feed-configs.ts` と Go の `feeds.yaml` を二重管理しないために YAML を正とする。

```yaml
# backend/feeds.yaml
feeds:
  - id: gnews-politics
    name: Google News 政治
    url: "https://news.google.com/rss/search?q=..."
    type: google-news
    category: 政治
    filter_political: false
    default_enabled: true

  - id: nhk
    name: NHK
    url: "https://www.nhk.or.jp/rss/news/cat0.xml"
    type: rss
    category: 総合
    filter_political: false
    default_enabled: false

  - id: yomiuri
    name: 読売新聞
    url: "https://news.google.com/rss/search?q=site:yomiuri.co.jp..."
    type: google-news
    category: 総合
    filter_political: false
    default_enabled: false
    canonical_source: 読売新聞

  # ... 他のフィードも同様
```

Next.js 側の `feed-configs.ts` は YAML から自動生成するスクリプトを用意する（or フロント用は YAML を直接 fetch）。

---

## DBスキーマ

### RssArticle 拡張（既存 + 追加カラム）

既に `embedding vector(1024)` は追加済み。バッチ処理で以下を追加:

```sql
ALTER TABLE "RssArticle" ADD COLUMN IF NOT EXISTS "embeddedAt" TIMESTAMPTZ;
ALTER TABLE "RssArticle" ADD COLUMN IF NOT EXISTS "classifiedAt" TIMESTAMPTZ;
```

- `embeddedAt IS NULL` → embed 対象
- `classifiedAt IS NULL` → classify 対象

### 新テーブル: ProcessedSnapshot

```sql
CREATE TABLE "ProcessedSnapshot" (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "processedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "articleCount" INT NOT NULL,
  "groupCount"   INT NOT NULL,
  "durationMs"   INT NOT NULL,
  status         TEXT NOT NULL,  -- 'success' | 'partial' | 'failed'
  error          TEXT
);
CREATE INDEX idx_snapshot_processed ON "ProcessedSnapshot" ("processedAt" DESC);

CREATE TABLE "SnapshotGroup" (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "snapshotId"  TEXT NOT NULL REFERENCES "ProcessedSnapshot"(id) ON DELETE CASCADE,
  "groupTitle"  TEXT NOT NULL,
  category      TEXT,
  subcategory   TEXT,
  rank          INT NOT NULL,
  "singleOutlet" BOOLEAN NOT NULL,
  "coveredBy"   JSONB,   -- string[]
  "silentMedia" JSONB    -- string[]
);
CREATE INDEX idx_sg_snapshot ON "SnapshotGroup" ("snapshotId");

CREATE TABLE "SnapshotGroupItem" (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "groupId"   TEXT NOT NULL REFERENCES "SnapshotGroup"(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  url         TEXT NOT NULL,
  source      TEXT NOT NULL,
  summary     TEXT,
  "publishedAt" TEXT,
  category    TEXT,
  subcategory TEXT
);
CREATE INDEX idx_sgi_group ON "SnapshotGroupItem" ("groupId");
```

**注意**: Prisma スキーマにも追加し `prisma generate` を実行する（Next.js 読み取り用）。
ただし Go は Prisma を使わず `pgx` で直接操作する。

---

## 排他制御

Go から PostgreSQL advisory lock を使用。テーブル不要、プロセスクラッシュ時に自動解放:

```go
// db/lock.go
func AcquirePipelineLock(ctx context.Context, pool *pgxpool.Pool) (bool, error) {
    const lockID = 123456789 // 固定のアプリケーション固有ID
    var acquired bool
    err := pool.QueryRow(ctx,
        "SELECT pg_try_advisory_lock($1)", lockID,
    ).Scan(&acquired)
    return acquired, err
}

func ReleasePipelineLock(ctx context.Context, pool *pgxpool.Pool) error {
    const lockID = 123456789
    _, err := pool.Exec(ctx, "SELECT pg_advisory_unlock($1)", lockID)
    return err
}
```

BatchLock テーブルは不要。advisory lock はセッション終了（DB接続切断）で自動解放されるため、
プロセスがクラッシュしてもロックが残らない。

---

## 実行モード

### `newsprism-batch run`

パイプラインを1回実行して終了。crontab から呼ぶ場合に使用:

```bash
# crontab -e
0 * * * * /usr/local/bin/newsprism-batch run 2>&1 | logger -t newsprism
```

### `newsprism-batch serve`

HTTP サーバー + 内蔵 cron スケジューラとして常駐:

```
POST /run          — パイプライン手動実行（Next.js の手動更新ボタンから）
GET  /status       — 最新の実行結果サマリ
GET  /health       — ヘルスチェック
```

```go
c := cron.New()
c.AddFunc("0 * * * *", func() { pipeline.Run(ctx) })
c.Start()

r := chi.NewRouter()
r.Post("/run", handleRun)
r.Get("/status", handleStatus)
r.Get("/health", handleHealth)
http.ListenAndServe(":8090", r)
```

---

## Next.js 側の変更

### 読み取り API（Next.js に残す）

```
GET /api/batch/latest   — 最新スナップショット取得（Prisma で読むだけ）
GET /api/batch/history  — 履歴一覧
```

これらは単純な DB 読み取りなので Next.js API Route のまま。

### 手動更新ボタン

`/ranking` ページの更新ボタンから Go サーバーの `POST /run` を呼ぶ:

```typescript
// Next.js の環境変数
BATCH_SERVER_URL=http://localhost:8090

// ボタン押下時
await fetch(`${process.env.NEXT_PUBLIC_BATCH_SERVER_URL}/run`, { method: "POST" });
```

### 廃止する API Route

Phase B（スナップショット読み出しに切り替え後）:

| 廃止候補 | 理由 |
|---------|------|
| `POST /api/rss/group` | Go バッチが代替 |
| `GET /api/rss` | フィード取得は Go に移行 |
| `GET /api/bias/coverage` | スナップショットに `coveredBy`/`silentMedia` 含有 |

### 残す API Route

| エンドポイント | 理由 |
|--------------|------|
| `POST /api/analyze` | 個別記事の3軸分析はオンデマンド（ユーザー操作起点） |
| `POST /api/fetch-article` | 記事本文取得もオンデマンド |
| `GET /api/batch/latest` | スナップショット読み取り |

---

## 移行戦略

| フェーズ | 内容 | Go の範囲 |
|---------|------|----------|
| **Phase A** | Go バッチ実行可能。UI は従来のオンデマンドも併用 | collect → store |
| **Phase B** | `/ranking` のデータソースを `GET /api/batch/latest` に切替 | 同上 |
| **Phase C** | オンデマンド RSS API を廃止 | 同上 + フィード取得完全移管 |
| **Phase D（将来）** | `/api/analyze` も Go に移管（SSE 含む） | 全バックエンド |

---

## Google News 固有ロジック（移植が必要）

Go の RSS パーサーで再実装する必要がある箇所:

1. **`<source>` 要素から媒体名抽出**: `gofeed` の `Extensions` から取得
2. **タイトル末尾の " - 媒体名" 除去**: 正規表現で strip
3. **`canonicalSource` による表記揺れ統一**: feeds.yaml で定義、パース時に適用
4. **政治フィルタ（キーワードマッチ）**: `POLITICAL_KEYWORDS` / `EXCLUDE_KEYWORDS` の Go 移植

---

## 分類カスケード（移植が必要）

現在の TypeScript 実装:
1. 参照 embedding を起動時に1回生成（サブカテゴリごとの文言をベクトル化）
2. 記事 embedding とコサイン類似度で分類（CPU で完結）
3. confidence < 0.5 の場合のみ LLM にフォールバック

Go 移植のポイント:
- 参照 embedding は DB or メモリにキャッシュ（Go はプロセスが長寿命なのでメモリキャッシュが有効）
- コサイン類似度計算は Go で直書き（ライブラリ不要）
- LLM フォールバックは `llm/chat.go` 経由

---

## 環境変数

```bash
# backend/.env
DATABASE_URL=postgresql://newsprism:newsprism@localhost:5432/newsprism
LLM_BASE_URL=http://localhost:8081
LLM_MODEL=ggml-org/gemma-4-E4B-it-Q8_0
CLASSIFY_MODEL=ggml-org/gemma-4-E4B-it-Q8_0
EMBED_MODEL=Targoyle/ruri-v3-310m-GGUF:Q8_0
GROUP_CLUSTER_THRESHOLD=0.87
FEED_GROUP_SIMILARITY_THRESHOLD=0.87
EMBED_CLASSIFY_THRESHOLD=0.5
BATCH_PORT=8090
```

Next.js の `src/lib/config/index.ts` と同じキーを使用。

---

## 注意事項

- **スキーマ管理**: Prisma でマイグレーション（Next.js と DB スキーマを共有）。Go は pgx で直接操作
- **llama.cpp の起動前提**: embedding/LLM はローカルサーバーに依存。未起動時は `status: "partial"` で記録
- **スナップショット保持期間**: 7日分を保持、それ以前は CASCADE 削除
- **初回実行**: スナップショットが空の場合、UI はフォールバックとしてオンデマンドフローを使用（Phase A）
- **SnapshotGroupItem.topic → category**: 3層 taxonomy リネーム済みに合わせて `category` / `subcategory` を使用
