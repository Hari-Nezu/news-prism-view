# ニュース分類体系

## 現状

現在のコードベースでは、分類は `category` / `subcategory` / `topic` の3層を前提にしている。  
ただし実装状況は均等ではない。

- `category`: 実装済み
- `subcategory`: フィールドはあるが、Go バッチでは未活用が多い
- `topic`: グループ名 `groupTitle` として実装済み

---

## 3層の役割

| 層 | 現在の扱い | 例 |
|---|---|---|
| `category` | 記事単位の大分類 | `politics` |
| `subcategory` | 記事単位の中分類 | `diplomacy` |
| `topic` | グループ命名で決まる具体的イベント名 | `石破首相の訪米` |

`topic` は記事単体フィールドではなく、主に `NewsGroup.groupTitle` として扱っている。

---

## 定義ファイル

静的な category / subcategory 定義は [news-taxonomy-configs.ts](/Users/mk/Development/NewsPrismView/news-prism-view/src/lib/config/news-taxonomy-configs.ts) にある。

カテゴリは現在 8種:

- `politics`
- `economy`
- `business`
- `health`
- `disaster`
- `sports`
- `science_tech`
- `culture_lifestyle`

---

## 現在の実装状況

### フロント / Next.js 側

- `RssFeedItem.category`
- `RssFeedItem.subcategory`
- `NewsGroup.category`
- `NewsGroup.subcategory`
- `NewsGroup.topic?` は補助的に残っているが、実質 `groupTitle` と同義

型定義は [types/index.ts](/Users/mk/Development/NewsPrismView/news-prism-view/src/types/index.ts) を参照。

### Prisma / DB 側

`rss_articles` には次がある。

- `category`
- `subcategory`

物理名は `snake_case`、Prisma論理名は camelCase で扱う。

### Go バッチ側

現状の Go バッチ分類は **キーワード分類のみ**。

- `category` は更新する
- `subcategory` は空文字のまま保存されることが多い
- embedding → LLM のカスケード分類は未移植

---

## topic の現在位置

`topic` という概念自体は残っているが、現在は主に以下の意味になっている。

- 記事単位ではなく、グループ単位の具体的イベント名
- 実装上は `groupTitle`
- `NewsGroup.topic?` は補助的フィールド

したがって、今のコードを読む時は:

- 記事の分類を見るなら `category` / `subcategory`
- グループのテーマを見るなら `groupTitle`

と理解するのが実態に合う。

---

## 今後の整理余地

- `NewsGroup.topic` を完全に `groupTitle` へ寄せて整理する
- Go バッチにも subcategory 判定を入れる
- Next.js 側と Go 側の分類ロジック差を縮める
