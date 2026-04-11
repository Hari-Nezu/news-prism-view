# ニュース分類体系 仕様

## 現状

現在のコードベースでは、分類は `category` / `subcategory` / `topic` の3層を前提にしている。

- `category`: 記事単位の大分類 (`politics`)
- `subcategory`: 記事単位の中分類 (`diplomacy`)
- `topic`: グループ命名で決まる具体的イベント名 (`石破首相の訪米`)。実装上は `groupTitle` で扱っている。

---

## 定義ファイル

静的な category / subcategory 定義は `src/lib/config/news-taxonomy-configs.ts` と `batch/internal/taxonomy/taxonomy.go` にある。

---

## 現在の実装状況

### フロント / Next.js 側

- `RssFeedItem.category` / `subcategory`
- `NewsGroup.category` / `subcategory`
- `NewsGroup.topic?` は補助的に残っているが、実質 `groupTitle` と同義

型定義は `src/types/index.ts` を参照。

### Prisma / DB 側

`rss_articles` には次がある。

- `category`
- `subcategory`

物理名は `snake_case`、Prisma論理名は camelCase で扱う。

### Go バッチ側

Go バッチ分類は embeddingに基づくLLMカスケードによる分類（`classify.go`）に改善され、`category` と `subcategory` を安定的に付与する。

---

## topic の現在位置

`topic` という概念自体は残っているが、現在は主に以下の意味になっている。

- 記事単位ではなく、グループ単位の具体的イベント名
- 実装上は `groupTitle`
- `NewsGroup.topic?` は補助的フィールド

記事の分類を見るなら `category` / `subcategory`、グループのテーマを見るなら `groupTitle` と理解するのが実態に合う。
