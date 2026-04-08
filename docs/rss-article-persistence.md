# RSS記事永続化仕様

## 現状

RSS 由来の記事は `rss_articles` に保存している。  
保持期間は 3 ヶ月、グルーピング用の参照窓は主に直近 3 日。

現在は **Next.js 側の `src/lib/db.ts` と Go バッチ側の両方** が `rss_articles` を触る。

---

## データモデル

Prisma 論理名は `RssArticle`、物理テーブル名は `rss_articles`。

主な列:

- `url`
- `title`
- `source`
- `summary`
- `image_url`
- `published_at`
- `category`
- `subcategory`
- `fetched_at`
- `embedded_at`
- `classified_at`
- `embedding`

---

## Next.js 側の upsert

[db.ts](/Users/mk/Development/NewsPrismView/news-prism-view/src/lib/db.ts) に `upsertRssArticles()` がある。

挙動:

- URLが空の記事はスキップ
- 50件単位で chunk INSERT
- `ON CONFLICT (url) DO UPDATE`
- `category` / `subcategory` は `COALESCE` で既存値優先
- `fetched_at` は更新

概念的には次の SQL。

```sql
INSERT INTO rss_articles (
  id, url, title, source, summary, image_url, published_at, category, subcategory, fetched_at
)
VALUES (...)
ON CONFLICT (url) DO UPDATE SET
  category    = COALESCE(EXCLUDED.category, rss_articles.category),
  subcategory = COALESCE(EXCLUDED.subcategory, rss_articles.subcategory),
  fetched_at  = NOW();
```

---

## 読み出し

Next.js 側には次がある。

- `getRssArticlesSince()`
- `getRssArticlesBetween()`

いずれも `rss_articles` から `RssFeedItem[]` 相当を返す。

---

## クリーンアップ

`deleteStaleRssArticles()` は実装済み。

```sql
DELETE FROM rss_articles
WHERE fetched_at < NOW() - INTERVAL '3 months'
```

---

## Go バッチ側

Go バッチも `rss_articles` に upsert する。

現在の役割:

- collect: 記事取得と保存
- embed: `embedded_at` / `embedding`
- classify: `category` / `subcategory` / `classified_at`
- group: 直近記事を読み出して snapshot 生成

さらに現在は、主要媒体として定義されていない `source` を保存しない。

---

## 現在の結論

- `rss_articles` は共通の作業テーブル
- Next.js と Go バッチの両方が触る
- 物理名は `snake_case`
- `topic` ベースの古い説明はもう使わない
