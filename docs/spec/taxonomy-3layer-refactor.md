# リファクタリング: 3層分類体系への移行

## 現状

このリファクタは **大筋では実施済み**。  
少なくとも次はすでに終わっている。

- `RssFeedItem.topic` ではなく `category` を使う
- `rss_articles` に `category` / `subcategory` を持つ
- `NewsGroup` に `category` / `subcategory` を持つ
- グループ名 `groupTitle` を topic 相当として扱う

---

## すでに反映済みのもの

### 型

[types/index.ts](/Users/mk/Development/NewsPrismView/news-prism-view/src/types/index.ts)

- `RssFeedItem.category`
- `RssFeedItem.subcategory`
- `NewsGroup.category`
- `NewsGroup.subcategory`

### Prisma

[schema.prisma](/Users/mk/Development/NewsPrismView/news-prism-view/prisma/schema.prisma)

- `RssArticle.category`
- `RssArticle.subcategory`
- `SnapshotGroup.category`
- `SnapshotGroup.subcategory`
- `SnapshotGroupItem.category`
- `SnapshotGroupItem.subcategory`

### DBアクセス

[db.ts](/Users/mk/Development/NewsPrismView/news-prism-view/src/lib/db.ts)

- `rss_articles.category`
- `rss_articles.subcategory`
- upsert / read ともに `topic` ではなく `category`

---

## 残っている曖昧さ

`NewsGroup.topic?` は型上まだ残っている。  
ただし実態としては `groupTitle` と同義で、主役は `groupTitle`。

そのため現在の理解としては:

- 記事単位: `category` / `subcategory`
- グループ単位の具体テーマ: `groupTitle`

で見るのが正しい。

---

## Go バッチとの関係

Go バッチでも `category` / `subcategory` 列は扱う。  
ただし現状の分類はキーワードベースで、`subcategory` は十分には活用されていない。

つまり、3層構造の箱は揃っているが、運用の深さはまだ均一ではない。

---

## 現在の結論

- `topic → category` リネーム方針は実装済み
- 3層のうち、`topic` は `groupTitle` へ寄せて運用中
- 今後の整理ポイントは `NewsGroup.topic` の扱いをさらに明確にすること
