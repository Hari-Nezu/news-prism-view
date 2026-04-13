<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# NewsPrism — 破壊的変更・トラップ集

> ディレクトリ構成・技術一覧・起動方法はコードから読み取れるためここには書かない。
> **ここには「これがないとClaudeがミスする」情報だけを記載する。**

## Zod v4

- `ZodError.errors` は **存在しない** → `ZodError.issues` を使う

## Prisma v7

接続URL管理が2分割された:

| 用途 | 場所 |
|:--|:--|
| マイグレーション | `prisma.config.ts` → `defineConfig({ datasource: { url } })` |
| ランタイム | `src/lib/db.ts` → `new PrismaClient({ adapter: new PrismaPg(...) })` |

- `schema.prisma` の `datasource` に `url` を **書いてはいけない**
- `@prisma/adapter-pg` + `pg` パッケージが必要

## pgvector

- `Unsupported("vector(768)")` カラムは Prisma CRUD では操作不可 → 生SQL必須
- `embedding IS NOT NULL` フィルタを忘れずに
- INSERT: `$1::vector`、検索: `embedding <=> $1::vector`（コサイン距離）

## Tailwind v4

- `tailwind.config.js` は **不要・生成禁止** → `globals.css` の `@import "tailwindcss"` で完結
- 任意値記法: `border-3` は存在しない → `border-[3px]`
- ダークモード背景は CSS 変数 `--background` で管理 → `<body>` に `bg-gray-*` を直書きしない

## SSE ストリーミング

- 新規 SSE 処理は `src/lib/parse-sse.ts` の `parseSSEBuffer` を使う（インライン実装を追加しない）

## Go

- ビルドキャッシュ: `GOCACHE=../.gocache` か絶対パス指定（`.gitignore` 対象）
- `SharedConfig` を JSON レスポンスにそのまま返さない（DB URL・APIキーが含まれる）

## 3軸スコアリング定義

| 軸 | -1.0 | +1.0 |
|:--|:--|:--|
| `economic` | 市場原理・小さな政府 | 再分配・大きな政府 |
| `social` | 伝統・秩序 | 多様性・個人の自由 |
| `diplomatic` | 抑止力・タカ派 | 対話・ハト派 |
