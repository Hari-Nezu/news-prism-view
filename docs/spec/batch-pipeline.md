# バッチパイプライン設計（Go 実装）

## 背景・動機

現状は、ランキング用の集計処理を Go バッチへ移し、Next.js はスナップショットの読み取りを担当している。  
一方で、個別記事分析や比較などの一部機能は引き続き Next.js 側のオンデマンド処理で残っている。

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
│  │   name → store                          │ │
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
| HTTP | `net/http` | 現状は `ServeMux` で十分 |
| DB | `jackc/pgx/v5` | PostgreSQL最速ドライバ |
| pgvector | `pgvector/pgvector-go` | `pgx` 統合済み |
| RSS | `mmcdole/gofeed` | 最も成熟した Go RSS パーサー |
| cron | `robfig/cron/v3` | `serve` モード用の内蔵スケジューラ |
| CLI | `os.Args` + 標準処理 | 現状は `run` / `serve` の2コマンドのみ |
| 設定 | 環境変数 + YAML | フィード定義は YAML 共有ファイル |
| ログ | `log/slog` | Go 1.21+ 標準の構造化ログ |

---

## ディレクトリ構成

```
batch/
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
│   │   ├── classify.go          — キーワード分類
│   │   ├── group.go             — グリーディクラスタリング
│   │   ├── name.go              — LLM グループ命名
│   │   └── store.go             — スナップショット保存
│   ├── llm/
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
[cron / CLI] → collect → embed → classify → group → name → store
                 ↓                                           ↓
              rss_articles                             processed_snapshots
              (embedding保存)                            ├─ snapshot_groups
                                                         └─ snapshot_group_items
```

### ステージ

| # | ステージ | 処理内容 | Go の並行性 | 推定時間 |
|---|---------|---------|-----------|---------|
| 1 | **collect** | 全フィード RSS 並行取得、RssArticle upsert | goroutine × フィード数 | ~5s |
| 2 | **embed** | embedding 未計算記事のバッチ embedding | バッチAPI 1回（llama.cpp が並行処理） | ~20s/100件 |
| 3 | **classify** | category/subcategory 未分類記事の分類 | embedding→LLM→キーワード カスケード | ~5s |
| 4 | **group** | embedding コサイン類似度クラスタリング | Go 内で完結（CPU） | ~1s |
| 5 | **name** | LLM グループ命名 | 1回の API 呼び出し | ~10s |
| 6 | **store** | スナップショット保存 + 古いスナップショット削除 | トランザクション 1回 | ~2s |

合計: 1回あたり約1分（記事100件想定、collect の goroutine 並行で短縮）

---

## フィード定義の共有

現状は Go 側の `batch/feeds.yaml` がバッチ収集の正となっている。  
Next.js 側には別途 `src/lib/config/feed-configs.ts` も存在するため、完全な単一ソース化はまだ未実施。

```yaml
# batch/feeds.yaml
feeds:
  - id: gnews-politics
    name: Google News 政治
    url: "https://news.google.com/rss/search?q=..."
    type: google-news
    category: 政治
    filter_political: false
    default_enabled: false

  - id: nhk
    name: NHK
    url: "https://www.nhk.or.jp/rss/news/cat0.xml"
    type: rss
    category: 総合
    filter_political: false
    default_enabled: true

  - id: yomiuri
    name: 読売新聞
    url: "https://news.google.com/rss/search?q=site:yomiuri.co.jp..."
    type: google-news
    category: 総合
    filter_political: false
    default_enabled: true
    canonical_source: 読売新聞

  # ... 他のフィードも同様
```

補足:

- `Google News 政治` などのトピック feed は `default_enabled: false`
- 主要媒体 15 社は `default_enabled: true`
- Google News 経由の媒体 feed でも、収集後に `canonical_source` で主要媒体名へ正規化する
- 収集段階で、主要媒体として定義されていない `source` は破棄する

---

## DBスキーマ

### `rss_articles`

`rss_articles` に embedding / 分類 / 取得時刻を保持する。

```sql
ALTER TABLE rss_articles ADD COLUMN IF NOT EXISTS embedded_at TIMESTAMPTZ;
ALTER TABLE rss_articles ADD COLUMN IF NOT EXISTS classified_at TIMESTAMPTZ;
```

- `embedded_at IS NULL` → embed 対象
- `classified_at IS NULL` → classify 対象

### スナップショット系テーブル

```sql
CREATE TABLE processed_snapshots (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  processed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  article_count INT NOT NULL,
  group_count   INT NOT NULL,
  duration_ms   INT NOT NULL,
  status         TEXT NOT NULL,  -- 'success' | 'partial' | 'failed'
  error          TEXT
);
CREATE INDEX idx_snapshot_processed ON processed_snapshots (processed_at DESC);

CREATE TABLE snapshot_groups (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  snapshot_id   TEXT NOT NULL REFERENCES processed_snapshots(id) ON DELETE CASCADE,
  group_title   TEXT NOT NULL,
  category      TEXT,
  subcategory   TEXT,
  rank          INT NOT NULL,
  single_outlet BOOLEAN NOT NULL,
  covered_by    JSONB,   -- string[]
  silent_media  JSONB    -- string[]
);
CREATE INDEX idx_sg_snapshot ON snapshot_groups (snapshot_id);

CREATE TABLE snapshot_group_items (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  group_id    TEXT NOT NULL REFERENCES snapshot_groups(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  url         TEXT NOT NULL,
  source      TEXT NOT NULL,
  summary     TEXT,
  published_at TEXT,
  category    TEXT,
  subcategory TEXT
);
CREATE INDEX idx_sgi_group ON snapshot_group_items (group_id);
```

Prisma 側では論理名を `ProcessedSnapshot` / `SnapshotGroup` / `SnapshotGroupItem` に保ちつつ、物理名を `@@map` / `@map` で `snake_case` に寄せている。  
Go 側は `pgx` で物理名を直接操作する。

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
POST /run     — パイプライン手動実行（Next.js の手動更新ボタンから）
GET  /health  — ヘルスチェック
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
await fetch("/api/batch/run", { method: "POST" });
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

## Google News 固有ロジック（実装済み）

Go の RSS パーサーで実装済みの箇所:

1. **`<source>` 要素から媒体名抽出**: `gofeed` の `Extensions` から取得
2. **タイトル末尾の " - 媒体名" 除去**: 正規表現で strip
3. **`canonicalSource` による表記揺れ統一**: feeds.yaml で定義、パース時に適用
4. **政治フィルタ（キーワードマッチ）**: `POLITICAL_KEYWORDS` / `EXCLUDE_KEYWORDS` の Go 移植

---

## 分類ステージ

`classify.go` は embedding → LLM → キーワードの 3 フェーズカスケードで `category` / `subcategory` を決定する。  
詳細は [news-categorization.md](./news-categorization.md) を参照。

---

## 環境変数

```bash
# batch/.env
DATABASE_URL=postgresql://newsprism:newsprism@localhost:5432/newsprism
LLM_BASE_URL=http://localhost:8081
LLM_MODEL=ggml-org/gemma-4-E4B-it-Q8_0
CLASSIFY_MODEL=ggml-org/gemma-4-E4B-it-Q8_0
EMBED_MODEL=Targoyle/ruri-v3-310m-GGUF:Q8_0
GROUP_CLUSTER_THRESHOLD=0.87
EMBED_CLASSIFY_THRESHOLD=0.5
TIME_DECAY_HALF_LIFE_HOURS=12
BATCH_PORT=8090
FEEDS_YAML_PATH=feeds.yaml
```

補足:

- Go 側は `EMBED_BASE_URL` も受け取れる
- `FEED_GROUP_SIMILARITY_THRESHOLD` は Go バッチでは未使用

---

## 注意事項

- **スキーマ管理**: Prisma と Go migration が混在。Next.js は Prisma で読むが、Go は `pgx` で直接操作
- **llama.cpp の起動前提**: embedding/LLM はローカルサーバーに依存。未起動時は `status: "partial"` で記録
- **スナップショット保持期間**: 7日分を保持、それ以前は CASCADE 削除
- **初回実行**: スナップショットが空の場合、UI はフォールバックとしてオンデマンドフローを使用（Phase A）
- **SnapshotGroupItem.topic → category**: 3層 taxonomy リネーム済みに合わせて `category` / `subcategory` を使用
- **対象媒体の制限**: バッチ収集では主要媒体として定義した `source` のみを保存し、未定義媒体や `Google News 政治` のような総称ソースは保存しない
