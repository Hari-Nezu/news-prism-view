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
| UI | React 19.2.4 |
| スタイリング | Tailwind v4（`tailwind.config.js` 不要） |
| LLM | Ollama（ローカル）— デフォルト `gemma3:12b` |
| 埋め込み | `nomic-embed-text`（768次元） |
| ベクトルDB | PostgreSQL + pgvector |
| ORM | Prisma v7 + `@prisma/adapter-pg` |
| バリデーション | Zod v4 |
| チャート | D3.js v7 |
| テスト | Vitest v4 |

---

## 2. ディレクトリ構成

```
src/
├── app/
│   ├── api/
│   │   ├── analyze/            # 記事分析（シングル・マルチモデル）
│   │   ├── batch/
│   │   │   ├── latest/         # 最新スナップショット取得
│   │   │   ├── history/        # スナップショット履歴
│   │   │   └── run/            # Goバッチ手動トリガー
│   │   ├── compare/            # メディア比較グループ化
│   │   │   └── analyze/        # グループ内各記事の逐次分析
│   │   ├── config/             # Ollama設定確認
│   │   ├── feed-groups/        # FeedGroup一覧（点検用）
│   │   ├── fetch-article/      # URL先の記事本文抽出
│   │   ├── history/            # 分析履歴取得
│   │   │   └── similar/        # ベクトル類似検索
│   │   ├── rss/                # RSSフィード取得
│   │   │   └── group/          # インクリメンタルグループ化
│   │   └── youtube/
│   │       ├── feed/           # チャンネルフィード取得
│   │       └── analyze/        # 動画字幕分析（SSE）
│   ├── page.tsx                # ホーム（記事分析）
│   ├── compare/page.tsx        # メディア比較
│   ├── inspect/page.tsx        # グループ品質点検（開発者向け）
│   ├── ranking/page.tsx        # ニュースまとめ（バッチ結果表示）
│   ├── youtube/page.tsx        # YouTube分析
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── RssFeedPanel.tsx        # RSSフィード表示・フィルタ・グループ化
│   ├── RankingFeedView.tsx     # Hero/Medium/Compact ティア表示
│   ├── RankingHeroCard.tsx
│   ├── RankingMediumCard.tsx
│   ├── RankingCompactItem.tsx
│   ├── ScoreCard.tsx           # 3軸Polar chartカード
│   ├── PositioningPlot.tsx     # 経済×社会 2D散布図
│   ├── NewsGroupCard.tsx       # グループ化ニュース表示
│   ├── MediaComparisonView.tsx # 媒体別分析結果並列比較
│   ├── ArticleHistory.tsx      # 過去分析記事一覧
│   ├── CompareHistory.tsx      # 比較セッション履歴
│   ├── FeedSettingsDrawer.tsx  # フィード設定ドロワー
│   ├── OllamaStatus.tsx        # Ollama接続状態インジケータ
│   ├── ArticleInput.tsx        # URL/タイトル入力フォーム
│   └── YouTubeChannelPanel.tsx # チャンネル選択UI
├── lib/
│   ├── db.ts                   # Prisma DB操作（ベクトル検索含む）
│   ├── ollama.ts               # Ollama API統合
│   ├── embeddings.ts           # ベクトル化（nomic-embed-text）
│   ├── rss-parser.ts           # RSS/Atomフィード取得
│   ├── news-grouper.ts         # 同一ニュースイベントのグループ化
│   ├── topic-classifier.ts     # キーワードベーストピック分類
│   ├── article-fetcher.ts      # URL先本文抽出（SSRF対策済み）
│   ├── compare-filter.ts       # キーワード検索＆類似フォールバック
│   ├── feed-configs.ts         # RSS/Google Newsフィード設定
│   ├── youtube-feed.ts         # YouTube RSS & 字幕取得
│   ├── youtube-channel-configs.ts # YouTubeチャンネル設定
│   ├── newsdata-client.ts      # NewsData.io API（オプション）
│   └── source-colors.ts        # メディア別カラー定義
├── types/
│   └── index.ts                # AxisScore, AnalysisResult, NewsGroup 等
└── __tests__/lib/              # Vitestテストスイート
```

---

## 3. 環境変数

`.env.local` に設定する。

```env
# Ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma3:12b
EMBED_MODEL=nomic-embed-text
MULTI_MODELS=gemma3:12b,qwen3.5:4b,llama3.2

# Database
DATABASE_URL=postgresql://newsprism:newsprism@localhost:5432/newsprism

# Optional
NEWSDATA_API_KEY=                     # 未設定で無効化
FEED_GROUP_SIMILARITY_THRESHOLD=0.68  # インクリメンタルグループ化の閾値
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

### `src/lib/db.ts`

Prisma シングルトン + ベクトル操作。

```typescript
getPrisma()                              // Lazy-loading（HMR対応）
saveArticle(article, embedding?)         // 記事保存＋ベクトル更新
getRecentArticles(limit)                 // 最近の分析記事
findSimilarArticles(embedding, ...)      // コサイン距離で類似検索
// FeedGroup/FeedGroupItem CRUD
// CompareSession/CompareResult CRUD
// YouTubeVideo CRUD
```

`embedding` の INSERT/SELECT は `$executeRawUnsafe` で生SQL必須（Prisma非対応型のため）。

---

### `src/lib/ollama.ts`

```typescript
analyzeArticle(title, content, model?)            // シングルモデル分析
analyzeArticleMultiModel(title, content, models?) // マルチモデル (AsyncGenerator)
checkOllamaHealth()                               // timeout 3000ms
SYSTEM_PROMPT                                     // 3軸評価プロンプト定義
MODEL_META                                        // モデル表示ラベル・色
```

- `format: "json"`, `temperature: 0.1`, `num_predict: 1024`

---

### `src/lib/embeddings.ts`

```typescript
embed(text)                    // テキスト → 768次元ベクトル
embedBatch(texts)              // 複数テキスト一括（Ollama 1回呼び出し）
embedArticle(title, summary)   // 記事用（上限2000文字）
embedNewsGroup(group)          // グループ用（タイトル+媒体+記事群）
```

---

### `src/lib/news-grouper.ts`

```typescript
groupArticlesByEvent(items)         // Ollama で同一イベントをグループ化（最大30件）
incrementalGroupArticles(items)     // DB埋め込みキャッシュを使ったインクリメンタル版
```

`incrementalGroupArticles` のロジック:
1. 新規記事を一括ベクトル化
2. 既存 `FeedGroup` のcentroidと類似度比較（閾値: 0.68）
3. マッチ → グループに追加（Ollama不要）
4. 未マッチ → Ollama でグループ化 → 新 `FeedGroup` 作成

---

### `src/lib/rss-parser.ts`

```typescript
fetchRssFeed(feedUrl, sourceName, filterPolitical)  // 任意RSSフィード取得
fetchFeedByConfig(config)                            // FeedConfig用
fetchAllDefaultFeeds(enabledIds?)                    // デフォルト有効フィード一括取得
isPolitical(title, summary)                          // 政治キーワードフィルタ
```

---

### `src/lib/article-fetcher.ts`

```typescript
validatePublicUrl(url)     // SSRF対策（ローカルIP・AWSメタデータURL拒否）
fetchArticleFromUrl(url)   // HTML → cheerio → 本文抽出
```

---

### `src/lib/compare-filter.ts`

```typescript
filterByKeyword(items, keyword)  // 完全マッチ → 単語重複35%閾値フォールバック
```

---

### `src/lib/topic-classifier.ts`

キーワードマッチで7カテゴリに分類:
`disaster` / `sports` / `diplomacy` / `politics` / `economy` / `tech` / `society` / `other`

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

Goバッチは `backend/feeds.yaml`（Next.jsの `feed-configs.ts` と同じ内容）を参照する。

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
