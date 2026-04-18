# NewsPrismView オンボーディングガイド

ニュース記事を **3つの政治軸（経済・社会・外交安保）** で自動分析し、メディアの思想的立場を可視化するツール。
Ollama（ローカルLLM）を使って記事をリアルタイム分析し、複数メディアの報道比較を支援する。

---

## 目次

1. [技術スタック](#1-技術スタック)
2. [ディレクトリ構成](#2-ディレクトリ構成)
3. [環境変数](#3-環境変数)
4. [データベーススキーマ](#4-データベーススキーマ)
5. [3軸スコアリング定義](#5-3軸スコアリング定義)
6. [主要データフロー](#6-主要データフロー)
7. [APIルート一覧](#7-apiルート一覧)
8. [ページ・コンポーネント一覧](#8-ページコンポーネント一覧)
9. [ライブラリ一覧](#9-ライブラリ一覧)
10. [Ollama連携詳細](#10-ollama連携詳細)
11. [RSSフィード・YouTubeチャンネル設定](#11-rssフィードyoutubeチャンネル設定)
12. [ローカル起動手順](#12-ローカル起動手順)
13. [テスト](#13-テスト)
14. [ハマりやすいポイント](#14-ハマりやすいポイント)

---

## 1. 技術スタック

| 用途 | 技術 |
|:--|:--|
| Web Framework | Next.js 16.2.1 (App Router) |
| API / Batch | Go 1.22 (Go Workspace) |
| UI | React 19.2.4 |
| スタイリング | Tailwind v4（`tailwind.config.js` 不要） |
| LLM | Ollama（ローカル）— デフォルト `gemma3:12b` |
| 埋め込み | `nomic-embed-text`（768次元） |
| ベクトルDB | PostgreSQL + pgvector |
| ORM (Next.js) | Prisma v7 + `@prisma/adapter-pg` |
| ORM (Go) | pgx v5 + pgvector-go |
| バリデーション | Zod v4 |
| チャート | D3.js v7 |
| テスト | Vitest v4 / Go testing |

---

## 2. ディレクトリ構成

```
.
├── go.work                # Go Workspace 設定
├── shared/                # Go 共通モジュール
│   ├── config/            # 共通設定（環境変数読み込み）
│   ├── db/                # DBアクセス（pgx 直接利用）
│   ├── llm/               # Ollama 連携（Chat, Embed）
│   └── taxonomy/          # ニュース分類カテゴリ定義
├── batch/                 # Go バッチ実行エンジン
│   ├── cmd/newsprism-batch/ # エントリポイント (serve/run)
│   └── internal/          # パイプライン・RSSパーサー
├── server/                # Go API サーバー（Next.js API Routes の移行先）
│   ├── cmd/newsprism-server/ # エントリポイント
│   └── internal/          # ハンドラ・ミドルウェア・RSS/YouTube/Scraper
├── src/                   # Next.js フロントエンド（app, components, lib, types）
├── prisma/                # DBスキーマ (schema.prisma)
└── docs/                  # 設計ドキュメント・メモ
```

### Next.js (src/app/api) から Go API (server/) への移行

Next.js の API Routes はすべて Go API サーバー（Port 8091）へ移行済みです。フロントエンドは `API_BASE` を通じて Go API を呼び出し、サーバーサイドでの DB アクセスや LLM 処理はすべて Go 側で行われます。

---

## 3. 環境変数

`.env.local` に設定する。

```env
# Go API / Batch 共通
DATABASE_URL=postgresql://newsprism:newsprism@localhost:5432/newsprism
LLM_BASE_URL=http://localhost:11434
EMBED_BASE_URL=http://localhost:11434
LLM_MODEL=gemma3:12b
CLASSIFY_MODEL=gemma3:4b
EMBED_MODEL=nomic-embed-text

# Go API (server)
API_PORT=8091
BATCH_SERVER_URL=http://localhost:8090

# Next.js
NEXT_PUBLIC_API_URL=http://localhost:8091
MULTI_MODELS=gemma3:12b,qwen3.5:4b,llama3.2
```

---

## 4. データベーススキーマ

**Prisma v7 では接続URL管理が2分割** されている（→ [ハマりやすいポイント](#prisma-v7) 参照）。

| テーブル | 管理 | 用途 |
|:--|:--|:--|
| `Article` | Prisma | 分析済みニュース記事（`embedding: vector(768)`） |
| `FeedGroup` | Prisma | RSSインクリメンタルグループ（centroid embedding） |
| `FeedGroupItem` | Prisma | FeedGroup内の記事（重複スキップ） |
| `CompareSession` | Prisma | 比較検索セッション（キーワード + JSONグループ） |
| `CompareGroupRecord` | Prisma | セッション内グループ化ニュースイベント |
| `CompareResult` | Prisma | 比較セッション内の個別分析結果 |
| `YouTubeVideo` | Prisma | 動画分析結果（字幕タイプ記録） |
| `RssArticle` | Prisma | Goバッチ収集記事（`embedding: vector(310)`） |
| `ProcessedSnapshot` | Go migration | バッチパイプライン実行記録 |
| `SnapshotGroup` | Go migration | グループ（報道・沈黙媒体情報つき） |
| `SnapshotGroupItem` | Go migration | グループ内の各記事 |

`embedding` カラムは `Unsupported("vector(...)")` で定義されており、Prisma の通常CRUDでは操作不可。生SQLが必要（後述）。

---

## 5. 3軸スコアリング定義

各記事は以下の4指標で `-1.0 〜 +1.0` にスコア化される。

| 軸 | -1.0 | +1.0 |
|:--|:--|:--|
| `economic` | 市場原理・小さな政府・規制緩和 | 再分配・大きな政府・社会保障 |
| `social` | 伝統・秩序・保守 | 多様性・個人の自由・進歩 |
| `diplomatic` | 抑止力・タカ派 | 対話・ハト派 |
| `emotionalTone` | 恐怖・怒り（煽り） | 希望・建設的 |

`biasWarning: true` は `emotionalTone >= ±0.6` のとき自動付与。

---

## 6. 主要データフロー

### 記事分析（ホームページ）

```
URL/タイトル入力
  → /api/fetch-article  : cheerio で本文抽出（SSRF防止付き）
  → /api/analyze        : Ollama でスコアリング
  → saveArticle + embed : DB保存 + ベクトル化
  → ScoreCard / PositioningPlot に表示
```

### メディア比較（Compare ページ）

```
キーワード入力
  → /api/compare           : RSS取得 → キーワードフィルタ → Ollama グループ化
  → ユーザーがグループ選択
  → /api/compare/analyze   : 各記事 URL取得 → Ollama 分析（SSEストリーミング）
  → MediaComparisonView に表示
```

### YouTube 分析

```
チャンネル選択
  → /api/youtube/feed      : YouTube RSS から最新動画一覧
  → /api/youtube/analyze   : 字幕取得（日本語→自動生成→なし）→ Ollama 分析（SSE）
  → ScoreCard / PositioningPlot に表示
```

### インクリメンタルグループ化（RSSパネル）

```
RSSフィード取得
  → /api/rss/group         : incrementalGroupArticles
      ├── 既存FeedGroupをembeddingで類似検索（閾値 0.68）
      ├── マッチ → グループに追加（Ollama呼び出しなし）
      └── 未マッチ → Ollama でグループ化 → 新FeedGroup作成
  → RankingFeedView に表示
```

---

## 7. APIルート一覧

| Route | Method | 説明 |
|:--|:--|:--|
| `/api/analyze` | POST | 記事分析。`multiModel: true` でSSEストリーミング |
| `/api/batch/latest` | GET | 最新スナップショット（グループ一覧含む） |
| `/api/batch/history` | GET | スナップショット履歴一覧 |
| `/api/batch/run` | POST | Goバッチ手動トリガー |
| `/api/feed-groups` | GET | アクティブFeedGroup一覧（点検用） |
| `/api/fetch-article` | POST | URL先の記事本文抽出 |
| `/api/config` | GET | Ollama接続確認・モデル名取得 |
| `/api/rss` | GET | RSSフィード取得。`?feedUrl=&feedName=&enabledIds=` |
| `/api/rss/group` | POST | `items[]` をインクリメンタルグループ化 |
| `/api/compare` | GET | キーワード → RSS取得 → Ollamaグループ化 |
| `/api/compare/analyze` | POST | グループ内各記事を逐次分析（SSE） |
| `/api/history` | GET | 分析履歴。`?type=articles\|compare` |
| `/api/history/similar` | POST | ベクトル類似検索 |
| `/api/youtube/feed` | GET | YouTube チャンネルフィード。`?channels=...` |
| `/api/youtube/analyze` | POST | 動画一括字幕分析（SSE） |

---

## 8. ページ・コンポーネント一覧

### ページ

| ファイル | Route | 説明 |
|:--|:--|:--|
| `app/page.tsx` | `/` | 記事URL/タイトル入力 → 分析 → スコア表示 |
| `app/ranking/page.tsx` | `/ranking` | バッチ収集ニュースのグループランキング表示 |
| `app/inspect/page.tsx` | `/inspect` | グループ品質点検（FeedGroup/Snapshot の2タブ） |
| `app/compare/page.tsx` | `/compare` | キーワード検索 → グループ化 → 媒体別分析比較 |
| `app/youtube/page.tsx` | `/youtube` | YouTubeチャンネル選択 → 字幕分析 |

### 主要コンポーネント

| コンポーネント | 責務 |
|:--|:--|
| `RssFeedPanel` | RSS記事一覧・フィルタ・インクリメンタルグループ化ループ |
| `RankingFeedView` | グループをHero/Medium/Compactの3ティアで表示 |
| `ScoreCard` | D3 Polar chartで3軸スコア可視化 |
| `PositioningPlot` | 経済軸×社会軸の2D散布図（複数記事比較） |
| `MediaComparisonView` | グループ内の媒体別分析結果を並列表示 |
| `NewsGroupCard` | 単一グループ（記事リスト + 分析トリガー） |
| `FeedSettingsDrawer` | フィード有効/無効設定（localStorageに保存） |
| `OllamaStatus` | Ollama接続状態インジケータ（ポーリング） |

---

## 9. ライブラリ一覧

フロントエンド（`src/lib/`）は主に純粋なロジック関数や SSE パース、共通定数のみを保持しています。DB アクセスや LLM 呼び出しの責務は Go API サーバーへ移譲されました。

- `src/lib/multi-model-analysis.ts`: マルチモデル分析結果の平均・分散計算
- `src/lib/topic-classifier.ts`: キーワードベースの補助分類
- `src/lib/parse-sse.ts`: Go API からの SSE ストリームパース
- `src/lib/media-matcher.ts`: 媒体名のマッチング定数
- `src/lib/format-time.ts`: 相対時刻・日時フォーマット
- `src/lib/source-colors.ts`: 媒体別ブランドカラー定義

---

## 10. Ollama連携詳細

### 必要なモデル

| 役割 | モデル | VRAM目安 |
|:--|:--|:--|
| 分析（デフォルト） | `gemma3:12b` | ~8GB |
| 分析（軽量） | `llama3.2` | ~2GB |
| 埋め込み | `nomic-embed-text` | ~500MB |

```bash
ollama pull gemma3:12b
ollama pull nomic-embed-text
```

### APIエンドポイント

| 用途 | Ollama API |
|:--|:--|
| テキスト生成 | `POST /api/generate` |
| 埋め込み | `POST /api/embed` |
| ヘルスチェック | `GET /api/tags` |

### マルチモデル分析

`MULTI_MODELS` env にカンマ区切りでモデルを指定すると、全モデルで並行分析し結果をSSEストリーミングで返す。
フロントエンドでコンセンサス（平均値 + 分散 + 最大分散軸）を計算して表示する。

---

## 11. RSSフィード・YouTubeチャンネル設定

### RSSフィード（`src/lib/config/feed-configs.ts`）

デフォルト有効フィード（15社）: NHK・朝日・毎日・産経・東洋経済・ハフポスト・読売・日経・東京新聞・時事・共同・TBS・テレ朝・日テレ・フジ。Google Newsトピック検索（政治・経済・国際）は無効。

Goバッチは `batch/feeds.yaml`（Next.jsの `feed-configs.ts` と同じ内容）を参照する。

### YouTubeチャンネル（`src/lib/youtube-channel-configs.ts`）

カテゴリ: `mainstream` / `independent` / `commentary`
デフォルト有効: TBS NEWS DIG、テレ朝news、PIVOT、ReHacQ

---

## 12. ローカル起動手順

### A. Docker（推奨）

```bash
docker compose up
# → http://localhost:3000
```

### B. ホスト Ollama + Docker DB（開発推奨）

```bash
# Ollama（ホスト）でモデルを先にpull
ollama pull gemma3:12b
ollama pull nomic-embed-text

docker compose -f docker-compose.local-ollama.yml up
```

### C. フルローカル

```bash
docker compose up db
npx prisma db push
npm run dev
```

---

## 13. テスト

```bash
npm run test           # 一回実行
npm run test:watch     # ウォッチモード
npm run test:coverage  # カバレッジ
```

テストファイル: `src/__tests__/lib/` 配下（topic-classifier, feed-configs, embeddings, source-colors, compare-filter）

---

## 14. ハマりやすいポイント

### Prisma v7

接続URL管理が**2か所に分離**されている。

| 用途 | ファイル |
|:--|:--|
| マイグレーション | `prisma.config.ts` → `defineConfig({ datasource: { url } })` |
| ランタイム | `src/lib/db.ts` → `new PrismaClient({ adapter: new PrismaPg(...) })` |

`schema.prisma` の `datasource` に `url` を書いてはいけない。

---

### pgvector（`Unsupported("vector(768)")`）

Prisma の通常CRUDでは操作不可。

```typescript
// INSERT
await prisma.$executeRawUnsafe(
  `UPDATE "Article" SET embedding = $1::vector WHERE id = $2`,
  `[${vec.join(",")}]`, id
);

// SELECT（コサイン距離）
await prisma.$queryRawUnsafe(
  `SELECT * FROM "Article" WHERE embedding IS NOT NULL
   ORDER BY embedding <=> $1::vector LIMIT $2`,
  `[${vec.join(",")}]`, limit
);
```

`embedding IS NOT NULL` フィルタ忘れずに。

---

### Zod v4

`ZodError.errors` は存在しない → `ZodError.issues` を使う。

---

### Tailwind v4

`tailwind.config.js` は不要・生成禁止。
`globals.css` の `@import "tailwindcss"` だけで動作する。

---

### Next.js 16.2.1

訓練データと異なるBreaking changesがある可能性がある。
コードを書く前に `node_modules/next/dist/docs/` の該当ガイドを確認すること。

---

### pgvector INSERT の型

```sql
$1::vector  -- INSERT時
embedding <=> $1::vector  -- コサイン距離検索時
```

---

### Prisma キャッシュキー

`src/lib/db.ts` の `PRISMA_CACHE_KEY` は、スキーマ変更後にインクリメントしないとHMR後も古いキャッシュを使い続ける。
