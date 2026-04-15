# ニュースのカテゴライズ仕様

## 概要

本プロジェクトのニュース整理は、以下の3つの役割で構成する。

- `category`: 記事単位の大分類
- `subcategory`: 記事単位の中分類
- `groupTitle`: グループ単位の具体的な出来事・論点名

旧来の `topic` は、現在は実質的に `groupTitle` 相当として扱う。  
記事の分類を見るときは `category` / `subcategory`、グループのテーマを見るときは `groupTitle` を見る。

## 正式 taxonomy

正式な分類定義は [shared/taxonomy/taxonomy.go](/Users/mk/Development/NewsPrismView/news-prism-view/shared/taxonomy/taxonomy.go) を正とする。  
Go と Next.js で同じ taxonomy を共有する前提で運用する。

現在の大分類は次の 11 カテゴリ。

| ID | ラベル |
|:--|:--|
| `politics` | 政治 |
| `economy` | 経済 |
| `business` | ビジネス |
| `international` | 国際・ワールド |
| `society` | 社会・事件 |
| `health` | 健康・医療 |
| `disaster` | 災害 |
| `sports` | スポーツ |
| `science_tech` | 科学・技術 |
| `weather` | 天気 |
| `culture_lifestyle` | 文化・ライフスタイル |

各カテゴリは複数の `subcategory` を持つ。分類器・保存処理・点検 UI は、この組み合わせを前提に動作する。

## データモデル上の扱い

### 記事

- `RssFeedItem.category`
- `RssFeedItem.subcategory`
- `rss_articles.category`
- `rss_articles.subcategory`

### グループ

- `NewsGroup.category`
- `NewsGroup.subcategory`
- `SnapshotGroup.category`
- `SnapshotGroup.subcategory`
- `SnapshotGroupItem.category`
- `SnapshotGroupItem.subcategory`

`NewsGroup.topic?` は補助的に残っていても、運用上の主役は `groupTitle`。

## 分類フロー

ニュース記事の分類は Go バッチの `classify` ステージで行う。  
方式は **embedding 類似度分類 → LLM フォールバック → キーワードフォールバック** のカスケード。

### 1. embedding による一次分類

- taxonomy の各 `subcategory` 説明文から参照 embedding を生成してキャッシュする
- 記事の `title + summary` を分類用テキストとして embed する
- 記事 embedding と参照 embedding のコサイン類似度を比較し、最良一致の `category` / `subcategory` を候補にする
- 閾値以上ならそのまま採用する

### 2. LLM フォールバック

embedding 類似度が閾値未満のときは、taxonomy 一覧をガイドとして LLM に JSON で分類させる。

### 3. キーワードフォールバック

LLM が失敗した場合だけ、最後の保険としてキーワード分類を使う。  
このフォールバックも正式 taxonomy の ID に合わせる。

### embedding プレフィックス

分類時の embedding は非対称モデル前提で扱う。

- 参照側: `"文章: "` プレフィックス
- 記事側: `"クエリ: "` プレフィックス

保存済み embedding をそのまま流用せず、分類用途では分類用のプレフィックスで再計算する。

## グルーピングでの利用

分類結果は単なる表示用メタデータではなく、グルーピングの制約にも使う。

### category ソフトゲート

Go バッチの grouping では、カテゴリ制約を段階的に使う。

- unknown と既知カテゴリの組み合わせはマージしない
- unknown 同士は通常より厳しい閾値で判定する
- 既知カテゴリ同士の不一致は即禁止ではなく、閾値を上乗せしたソフトゲートで判定する

つまり現在は「全面ハードゲート」ではない。  
別ニュースが embedding の近さだけで誤って合流するのを減らしつつ、分類ミスによる過分割を多少は許容する設計になっている。

### unknown レーン

`""` や `"other"` のような未確定カテゴリは unknown 扱いにする。  
unknown 同士はより厳しい閾値でのみマージ候補にする。

### 保存先

グループ確定後は `SnapshotGroup` と `SnapshotGroupItem` に `category` / `subcategory` を保存する。  
inspect UI ではこれを使って `cross_category_mismatch`、`subcategory_mismatch`、`no_category` を検出する。

## 現在の整理方針

- `topic -> category` へのリネーム方針は完了済み
- 記事分類は `category` / `subcategory` に統一する
- グループ単位の具体テーマは `groupTitle` に集約する
- taxonomy は共有定義を正とし、Go / Next.js / UI で別名体系を持たない

## 関連ファイル

- [shared/taxonomy/taxonomy.go](/Users/mk/Development/NewsPrismView/news-prism-view/shared/taxonomy/taxonomy.go)
- [batch/internal/pipeline/steps/classify.go](/Users/mk/Development/NewsPrismView/news-prism-view/batch/internal/pipeline/steps/classify.go)
- [batch/internal/pipeline/steps/group.go](/Users/mk/Development/NewsPrismView/news-prism-view/batch/internal/pipeline/steps/group.go)
- [src/types/index.ts](/Users/mk/Development/NewsPrismView/news-prism-view/src/types/index.ts)
- [src/lib/db.ts](/Users/mk/Development/NewsPrismView/news-prism-view/src/lib/db.ts)
- [src/app/inspect/page.tsx](/Users/mk/Development/NewsPrismView/news-prism-view/src/app/inspect/page.tsx)
