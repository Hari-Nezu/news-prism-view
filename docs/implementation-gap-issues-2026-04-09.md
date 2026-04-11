# 実装棚卸しと Issue 下書き（2026-04-09）

対象 docs:

- `batch-pipeline-design.md`
- `coverage-matrix-comparison.md`
- `grouping-inspection-design.md`
- `media-bias-targets.md`
- `news-classification.md`
- `public-private-separation.md`
- `refactor-taxonomy-3layer.md`
- `rss-article-persistence.md`
- `summary-page-features.md`
- `taxonomy-utilization.md`

## 実装状況まとめ

### すでに実装済み

- Go バッチの `run` / `serve`、cron 実行、advisory lock、snapshot 保存
- `processed_snapshots` / `snapshot_groups` / `snapshot_group_items`
- `/api/batch/latest` / `/api/batch/history` / `/api/batch/run` / `/api/batch/inspect`
- `CoverageMatrix` の表示と記事一覧オーバーレイ
- `/compare` と `/api/compare/analyze` による SSE 比較
- `/inspect` の snapshot 詳細点検と軽微な issue 検出
- `rss_articles` の永続化、cleanup、Go/Next.js 両側からの利用
- `category` / `subcategory` / `groupTitle(topic相当)` の3層構造の大枠
- taxonomy を使ったグルーピング時のカテゴリ減衰

### 未実装だが issue 化すべき内容

- Go / Next.js で分裂している feed 定義の単一ソース化
- CoverageMatrix オーバーレイからの直接比較導線
- inspect の再計算診断
- inspect の override / feedback / 専用詳細画面
- Go バッチの subcategory 分類強化と taxonomy 整合
- `NewsGroup.topic` の整理
- summary snapshot への 3軸/consensus/divergence 追加
- taxonomy を使った stance 集計 API と UI フィルタ
- public / internal 分離

### 現時点では issue 化しないもの

- `rss-article-persistence.md` の中心仕様は概ね実装済み
- `media-bias-targets.md` の「媒体に静的な政治立ち位置を事前付与する」は、文書上でも現方針と矛盾するため backlog 化しない

## ドキュメント別メモ

### `batch-pipeline-design.md`

- 実装済み: Go バッチ、`serve`、cron、snapshot 保存、history/latest API
- 未実装: feed 定義の完全単一ソース化

### `coverage-matrix-comparison.md`

- 実装済み: マトリクス表示、記事一覧オーバーレイ、`/compare` 側 SSE 比較
- 未実装: オーバーレイ内比較、SSE 状態遷移、`AbortController`

### `grouping-inspection-design.md`

- 実装済み: `/inspect`、`GET /api/batch/inspect`、保存済みデータ由来の issue 検出
- 未実装: 再計算診断、override、feedback、専用詳細ページ

### `media-bias-targets.md`

- 実装済み: 15媒体前提の coverage、canonical source 正規化、主要媒体以外の除外
- 未実装: 長期 stance 集計 API

### `news-classification.md`

- 実装済み: `category` / `subcategory` / `groupTitle`
- 未実装: Go バッチでの subcategory 活用、Next.js 側との差分解消

### `public-private-separation.md`

- 実装済み: なし
- 未実装: public/internal 分離の構造化

### `refactor-taxonomy-3layer.md`

- 実装済み: 大筋完了
- 未実装: `NewsGroup.topic` の整理

### `rss-article-persistence.md`

- 実装済み: 主要内容は完了
- 未実装: なし

### `summary-page-features.md`

- 実装済み: latest snapshot 表示、CoverageMatrix
- 未実装: 3軸ミニチャート、consensus/divergence、追加 batch stage

### `taxonomy-utilization.md`

- 実装済み: grouping penalty、snapshot への category/subcategory 保存、inspect での混在検出
- 未実装: naming への taxonomy 文脈注入、stance 集計 API、CoverageMatrix のカテゴリ絞り込み

## GitHub Issue 下書き

### 1. feed 定義を Go/Next.js 間で単一ソース化する

`batch-pipeline-design.md`

```md
## 概要
現在、feed 定義が `batch/feeds.yaml` と `src/lib/config/feed-configs.ts` に重複している。主要15媒体や Google News 系設定はほぼ同期しているが、二重管理のため差分混入リスクがある。

## 現状
- Go バッチは `batch/feeds.yaml` を読む
- Next.js は `src/lib/config/feed-configs.ts` を読む
- docs 上でも「完全な単一ソース化はまだ未実施」となっている

## やりたいこと
- feed 定義の source of truth を1箇所に寄せる
- Go/Next.js の両方から同一定義を参照できるようにする
- `canonical_source` / `default_enabled` / category 等の項目差異を無くす

## 受け入れ条件
- 主要15媒体と補助 feed の定義が単一ファイル/単一生成物に集約される
- Go バッチと Next.js の双方がそこから設定を読む
- 片側だけ編集しても差分が発生しない
- 既存の UI/バッチ動作が維持される
```

### 2. CoverageMatrix オーバーレイから直接メディア比較を開始できるようにする

`coverage-matrix-comparison.md`

```md
## 概要
CoverageMatrix は記事一覧オーバーレイまでは実装済みだが、その場で `MediaComparisonView` に遷移せず比較できない。既存の `/api/compare/analyze` SSE を再利用してオーバーレイ内比較を実装したい。

## 現状
- 行クリックで記事一覧オーバーレイを表示
- 比較機能は `/compare` ページ経由なら利用可能
- CoverageMatrix 側に `AbortController` や SSE 状態管理は無い

## やりたいこと
- オーバーレイ内に `報道姿勢を比較` 導線を追加
- `articles / analyzing / results / error` の view state を持たせる
- `/api/compare/analyze` を呼び出して SSE 進捗を表示
- 結果表示時に `MediaComparisonView` を埋め込む
- 分析中断に `AbortController` を使う

## 受け入れ条件
- CoverageMatrix の行クリック後、オーバーレイ内で比較開始できる
- 進捗/失敗/完了が UI で分かる
- 成功時は `MediaComparisonView` が表示される
- 閉じる/中断で接続リークしない
```

### 3. inspect に embedding ベースの再計算診断を追加する

`grouping-inspection-design.md`

```md
## 概要
現状の `/inspect` は保存済み snapshot の整合性確認に留まっており、embedding やクラスタ閾値に基づく再計算診断ができない。グルーピング誤りの原因分析を可能にしたい。

## 現状
- `GET /api/batch/inspect` は保存済みデータ由来の issue だけ返す
- `cross_category_mismatch` / `no_category` / `subcategory_mismatch` は見える
- centroid 距離や代替クラスタ候補は出せない

## やりたいこと
- `POST /api/batch/inspect/recompute` を追加
- `similarityToCentroid`
- `similarityBeforePenalty`
- `similarityAfterPenalty`
- `nearestNeighbors`
- `alternativeClusters`
- 閾値変更シミュレーション

## 受け入れ条件
- 保存済み group に対して再計算診断を実行できる
- 類似度と代替候補が UI で確認できる
- 現行 cluster に残った理由が説明可能になる
```

### 4. inspect の override / feedback 運用を追加する

`grouping-inspection-design.md`

```md
## 概要
点検結果に対して運用者が「表示上だけ分割したい」「記事を除外したい」「判断を記録したい」といった操作を行う仕組みが未実装。snapshot の不変性を保ったまま overlay 的な補正層を追加したい。

## やりたいこと
- override 用テーブル追加
- `POST /api/batch/inspect/overrides`
- `POST /api/batch/inspect/feedback`
- `/inspect/[snapshotId]/[groupId]` の専用詳細ページ追加
- 表示上の rename / exclude / move をサポート

## 受け入れ条件
- 元 snapshot は書き換えずに補正結果を適用できる
- 運用者の判断ログを保存できる
- 詳細画面で補正・履歴確認ができる
```

### 5. Go バッチの分類を subcategory 対応にして taxonomy を Next.js と揃える

`news-classification.md`, `taxonomy-utilization.md`

```md
## 概要
Go バッチの classify は現在キーワードで `category` を付けるだけで、`subcategory` はほぼ空。Next.js 側には taxonomy 定義と embedding/LLM ベースの分類ロジックがあり、実装深度に差がある。

## 現状
- Go: keyword-based category only
- Go: `subcategory` は空文字保存が多い
- Next.js: taxonomy 定義と subcategory 解決ロジックを持つ

## やりたいこと
- Go バッチでも subcategory を安定的に付与する
- taxonomy 定義の source of truth を共有する
- 命名や inspect で subcategory を活用しやすくする

## 受け入れ条件
- Go バッチで生成した snapshot に subcategory が一定品質で入る
- Next.js と Go で category/subcategory の ID 体系が一致する
- docs 上の「Go は未活用が多い」を解消できる
```

### 6. `NewsGroup.topic` を廃止または完全に `groupTitle` に統一する

`refactor-taxonomy-3layer.md`, `news-classification.md`

```md
## 概要
3層分類リファクタ自体はほぼ完了しているが、`NewsGroup.topic` が型上だけ残っており `groupTitle` と二重表現になっている。概念の曖昧さを解消したい。

## やりたいこと
- `NewsGroup.topic` を廃止するか deprecated 扱いにする
- `groupTitle` を topic 相当の唯一の表現に寄せる
- 参照箇所を洗い出して整合を取る

## 受け入れ条件
- 型定義と実データの意味が一致する
- 新規コードが `topic` に依存しない
- docs 上の説明とコード上の表現が揃う
```

### 7. summary snapshot に 3軸スコアと consensus/divergence を保存する

`summary-page-features.md`

```md
## 概要
まとめ画面は現状 latest snapshot と coverage 可視化に留まっており、グループ単位の論調要約や相違点抽出は未実装。snapshot 保存時に summary 用 enrichment を追加したい。

## やりたいこと
- batch pipeline に `score` / `consensus` 相当の stage を追加
- `SnapshotGroupItem.economic/social/diplomatic/confidence`
- `SnapshotGroup.consensusFacts`
- `SnapshotGroup.divergences`
- まとめ画面にミニ軸チャートを表示

## 受け入れ条件
- snapshot 読み取りだけで summary 画面に論調差分を表示できる
- group/item に必要な追加列または JSON が保存される
- `/compare` に行かなくても概要差分が見える
```

### 8. taxonomy を使った stance 集計 API と CoverageMatrix のカテゴリフィルタを追加する

`media-bias-targets.md`, `taxonomy-utilization.md`

```md
## 概要
taxonomy は現状グルーピングと inspect では使えているが、媒体ごとの長期傾向集計や UI フィルタには未展開。集計 API と最小 UI を追加して分析可能性を高めたい。

## やりたいこと
- `/api/bias/stance` を追加
- `source × category` の集計を返す
- CoverageMatrix または ranking で category 絞り込みを追加
- taxonomy 文脈を使った naming 改善の足場を作る

## 受け入れ条件
- 媒体別・カテゴリ別の傾向を API で取得できる
- ranking/coverage でカテゴリ別の見え方を切り替えられる
- 静的な「媒体の思想ラベル付け」に依存しない設計になっている
```

### 9. public / internal 分離のための read-only snapshot フロント構成を設計する

`public-private-separation.md`

```md
## 概要
現状は単一 Next.js アプリに public 候補の閲覧 UI と internal 向け運用 UI が同居している。snapshot 読み取り中心の public 面を切り出せるように構造を整理したい。

## やりたいこと
- public / internal の責務を明文化
- public 側の対象 API を snapshot 読み取りに限定
- DB read-only user または read replica 方針を決める
- `/ranking` 相当を public 面に載せる前提で依存を棚卸しする

## 受け入れ条件
- public に出す画面/API と internal 専用機能が一覧化されている
- DB 権限モデルが決まっている
- 実装着手可能な分離ステップに分解されている
```

## GitHub issue 作成コマンド例

認証復旧後、各 issue は `gh issue create --title '...' --body-file ...` で投入可能。

現状の `gh auth status`:

- `github.com` の default account token が invalid
- このままでは issue を直接作成できない
