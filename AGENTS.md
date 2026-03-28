<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# NewsPrism — 開発者ガイド（AIエージェント向け）

## プロジェクト概要

ニュース記事を **経済・社会・外交安保の3軸（各-1.0〜+1.0）** でスコアリングし、
思考のエコーチェンバーから脱却するための自律型ニュース解析ツール。

## 技術スタック

| レイヤー | 技術 | バージョン |
|:--|:--|:--|
| フレームワーク | Next.js (App Router) | 16.2.1 |
| UI | React + Tailwind CSS v4 | 19.x / 4.x |
| 可視化 | D3.js | 7.x |
| スキーマ検証 | Zod | **v4** (`.issues` を使用、`.errors` は存在しない) |
| LLM | Ollama HTTP API（ローカル） | - |
| 埋め込み | Ollama embed API（`nomic-embed-text`、768次元） | - |
| ORM | Prisma | **v7**（破壊的変更あり、下記参照） |
| DB | PostgreSQL + pgvector拡張 | pg16 |
| HTML解析 | Cheerio | 1.x |
| RSS取得 | rss-parser | 3.x |
| デプロイ | Docker Compose | - |

## ディレクトリ構成

```
src/
├── types/index.ts              # 共通型定義
├── lib/
│   ├── ollama.ts               # Ollama LLM APIクライアント
│   ├── embeddings.ts           # Ollama embed API（ベクトル生成）
│   ├── db.ts                   # Prismaクライアント + DB操作関数
│   ├── article-fetcher.ts      # URL→本文抽出
│   ├── rss-parser.ts           # RSSフィード取得・政治フィルタ
│   └── news-grouper.ts         # Ollamaによる同一ニュースグループ化
├── components/
│   ├── ArticleInput.tsx        # 記事入力UI
│   ├── PositioningPlot.tsx     # D3.js 2プロット（社会×経済、外交×経済）
│   ├── ScoreCard.tsx           # 分析結果カード
│   ├── RssFeedPanel.tsx        # RSSフィード一覧
│   ├── ArticleHistory.tsx      # 分析履歴パネル（DBから取得）
│   ├── NewsGroupCard.tsx       # 比較グループ選択カード
│   ├── MediaComparisonView.tsx # 媒体比較ビュー
│   └── CompareHistory.tsx      # 比較セッション履歴パネル
└── app/
    ├── api/analyze/route.ts            # POST /api/analyze（DB保存込み）
    ├── api/fetch-article/route.ts      # POST /api/fetch-article
    ├── api/rss/route.ts                # GET  /api/rss
    ├── api/compare/route.ts            # GET  /api/compare（グループ化+DB保存）
    ├── api/compare/analyze/route.ts    # POST /api/compare/analyze（SSE）
    ├── api/history/route.ts            # GET  /api/history
    ├── api/history/similar/route.ts    # POST /api/history/similar（ベクトル検索）
    ├── page.tsx                        # メインページ
    └── compare/page.tsx                # メディア比較ページ
prisma/
└── schema.prisma               # DBスキーマ（Article / CompareSession / CompareResult）
prisma.config.ts                # Prisma v7 マイグレーション設定（url指定）
docker/
└── init.sql                    # pgvector拡張の有効化（コンテナ初回起動時）
entrypoint.sh                   # コンテナ起動時に prisma db push → node server.js
```

## ⚠️ Prisma v7 の破壊的変更

Prisma v7 では接続URL管理が**2分割**された：

| 用途 | 場所 | 書き方 |
|:--|:--|:--|
| **マイグレーション** | `prisma.config.ts` | `defineConfig({ datasource: { url: ... } })` |
| **ランタイム** | `src/lib/db.ts` | `new PrismaClient({ adapter: new PrismaPg(...) })` |

- `schema.prisma` の `datasource` に `url` を書いてはいけない
- `@prisma/adapter-pg` と `pg` パッケージが必要

## pgvector の使い方

```ts
// INSERT（埋め込みのみ生SQL）
await prisma.$executeRawUnsafe(
  `UPDATE "Article" SET embedding = $1::vector WHERE id = $2`,
  `[${vec.join(",")}]`, id
);

// 類似検索（コサイン距離）
await prisma.$queryRawUnsafe(
  `SELECT *, 1-(embedding <=> $1::vector) AS similarity
   FROM "Article" WHERE embedding IS NOT NULL
   ORDER BY embedding <=> $1::vector LIMIT $2`,
  `[${vec.join(",")}]`, 5
);
```

- `Unsupported("vector(768)")` カラムは通常の Prisma CRUD では操作できない
- `embedding IS NOT NULL` フィルタを忘れずに

## 3軸スコアリングの定義

| 軸 | -1.0 | +1.0 |
|:--|:--|:--|
| `economic` | 市場原理・小さな政府・減税 | 再分配・大きな政府・社会保障 |
| `social` | 伝統・秩序・家族重視 | 多様性・個人の自由・変化 |
| `diplomatic` | 抑止力・タカ派（軍事重視） | 対話・ハト派（平和主義） |

## 環境変数

```
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
EMBED_MODEL=nomic-embed-text
DATABASE_URL=postgresql://newsprism:newsprism@localhost:5432/newsprism
NEWSDATA_API_KEY=
```

## 開発上の注意点

- **Zod v4**: `ZodError.errors` は廃止 → `ZodError.issues` を使う
- **Tailwind v4**: `tailwind.config.js` 不要、`globals.css` の `@import "tailwindcss"` で設定
- **D3.js**: Client Component (`"use client"`) 必須
- **DB保存はノンブロッキング**: `.catch()` でエラーをログするだけにしてレスポンスをブロックしない
- **埋め込み生成はベストエフォート**: embed モデルが未起動でも記事保存は継続する

## 起動方法

```bash
# 本番（pgvector + Ollamaモデル自動ダウンロード込み）
docker compose up

# 開発（ホットリロード）
docker compose -f docker-compose.yml -f docker-compose.dev.yml up


# ローカル開発（DB・Ollama 別途起動済みの場合）
cp .env.local.example .env.local
npx prisma db push   # テーブル作成
npm run dev
```
