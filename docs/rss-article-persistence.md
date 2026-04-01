# RSS記事永続化仕様

## 概要

RSSフィードから取得した記事をPostgreSQLに保存し、3日間のスライディングウィンドウでグルーピングに利用する。保持期間は3ヶ月。

## データモデル

```prisma
model RssArticle {
  id          String    @id @default(cuid())
  url         String    @unique        // 重複排除キー
  title       String
  source      String
  summary     String?
  imageUrl    String?
  publishedAt DateTime?
  topic       String?                  // LLM分類カテゴリ
  subcategory String?                  // LLM分類サブカテゴリ
  fetchedAt   DateTime  @default(now()) // 保存日時（保持期限の基準）
}
```

## 保存フロー

```
fetchAllDefaultFeeds()
  └─ RSS取得 + Newsdata取得
  └─ 重複排除・ソート
  └─ LLM一括分類（topic / subcategory 付与）
  └─ upsertRssArticles() ← fire-and-forget（非同期・エラー無視）
```

`upsertRssArticles` は `fetchAllDefaultFeeds` の戻り値に影響しない。DB保存の失敗はログのみ。

## Upsert仕様

**実装**: `src/lib/db.ts` — `upsertRssArticles(items: RssFeedItem[])`

- URLが空の記事はスキップ
- 50件単位でチャンク分割してバッチINSERT（N+1回避）
- `ON CONFLICT (url) DO UPDATE` で重複URLは更新のみ
  - `topic` / `subcategory`: 既存値があれば維持（COALESCE）
  - `fetchedAt`: 常に現在時刻で更新

```sql
INSERT INTO "RssArticle" (id, url, title, source, summary, "imageUrl", "publishedAt", topic, subcategory, "fetchedAt")
VALUES (...)
ON CONFLICT (url) DO UPDATE SET
  topic       = COALESCE(EXCLUDED.topic, "RssArticle".topic),
  subcategory = COALESCE(EXCLUDED.subcategory, "RssArticle".subcategory),
  "fetchedAt" = NOW()
```

## 読み出し

**実装**: `src/lib/db.ts` — `getRssArticlesSince(since: Date)`

- `fetchedAt >= since` の記事を `publishedAt DESC` で返す
- 戻り値は `RssFeedItem[]`（フロント型と統一）

利用箇所: `src/app/api/rss/group/route.ts`
- リクエスト時に過去3日分をDBから取得し、クライアント送信記事とマージ
- URLで重複排除後、インクリメンタルグループ化に投入

## 保持期限・クリーンアップ

**実装**: `src/lib/db.ts` — `deleteStaleRssArticles()`

```sql
DELETE FROM "RssArticle" WHERE "fetchedAt" < NOW() - INTERVAL '3 months'
```

呼び出し元: `src/app/api/rss/group/route.ts` — グループ化リクエスト時に fire-and-forget で実行

## グルーピングとの関係

`src/app/api/rss/group/route.ts` のウィンドウは **3日**（`WINDOW_MS = 3 * 24 * 60 * 60 * 1000`）。

```
POST /api/rss/group
  1. DBから過去3日分取得 (getRssArticlesSince)
  2. リクエストbodyのitemsとマージ（URLで重複排除）
  3. incrementalGroupArticles() でクラスタリング
  4. deleteStaleRssArticles() を非同期で実行
  5. groups を返す
```

DBが空（初回起動時等）でもリクエストbodyのitemsだけでグループ化できる。
