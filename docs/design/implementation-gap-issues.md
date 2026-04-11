# 実装 Gap・未実装課題一覧

## 未実装だが issue 化すべき内容

- Go / Next.js で分裂している feed 定義の単一ソース化
- ~~CoverageMatrix オーバーレイからの直接比較導線~~ → 実装済み（`spec/coverage-matrix-overlay-compare.md`）
- inspect の override / feedback / 専用詳細画面
- `NewsGroup.topic` の整理
- summary snapshot への 3軸/consensus/divergence 追加
- taxonomy を使った stance 集計 API と UI フィルタ
- public / internal 分離

## GitHub Issue 下書き

### 1. feed 定義を Go/Next.js 間で単一ソース化する

**概要**
現在、feed 定義が `batch/feeds.yaml` と `src/lib/config/feed-configs.ts` に重複している。主要15媒体や Google News 系設定はほぼ同期しているが、二重管理のため差分混入リスクがある。

**やりたいこと**
- feed 定義の source of truth を1箇所に寄せる
- Go/Next.js の両方から同一定義を参照できるようにする
- `canonical_source` / `default_enabled` / category 等の項目差異を無くす

### ~~2. CoverageMatrix オーバーレイから直接メディア比較を開始できるようにする~~ → 実装済み

`spec/coverage-matrix-overlay-compare.md` を参照。

### 3. inspect の override / feedback 運用を追加する

**概要**
点検結果に対して運用者が「表示上だけ分割したい」「記事を除外したい」「判断を記録したい」といった操作を行う仕組みが未実装。snapshot の不変性を保ったまま overlay 的な補正層を追加したい。

**やりたいこと**
- override 用テーブル追加
- `POST /api/batch/inspect/overrides`
- `POST /api/batch/inspect/feedback`
- `/inspect/[snapshotId]/[groupId]` の専用詳細ページ追加
- 表示上の rename / exclude / move をサポート

### 4. `NewsGroup.topic` を廃止または完全に `groupTitle` に統一する

**概要**
3層分類リファクタ自体はほぼ完了しているが、`NewsGroup.topic` が型上だけ残っており `groupTitle` と二重表現になっている。概念の曖昧さを解消したい。

**やりたいこと**
- `NewsGroup.topic` を廃止するか deprecated 扱いにする
- `groupTitle` を topic 相当の唯一の表現に寄せる
- 参照箇所を洗い出して整合を取る

### 5. summary snapshot に 3軸スコアと consensus/divergence を保存する

**概要**
まとめ画面は現状 latest snapshot と coverage 可視化に留まっており、グループ単位の論調要約や相違点抽出は未実装。snapshot 保存時に summary 用 enrichment を追加したい。

**やりたいこと**
- batch pipeline に `score` / `consensus` 相当の stage を追加
- `SnapshotGroupItem.economic/social/diplomatic/confidence`
- `SnapshotGroup.consensusFacts`
- `SnapshotGroup.divergences`
- まとめ画面にミニ軸チャートを表示

### 6. taxonomy を使った stance 集計 API と CoverageMatrix のカテゴリフィルタを追加する

**概要**
taxonomy は現状グルーピングと inspect では使えているが、媒体ごとの長期傾向集計や UI フィルタには未展開。集計 API と最小 UI を追加して分析可能性を高めたい。

**やりたいこと**
- `/api/bias/stance` を追加
- `source × category` の集計を返す
- CoverageMatrix または ranking で category 絞り込みを追加
- taxonomy 文脈を使った naming 改善の足場を作る

### 7. public / internal 分離のための read-only snapshot フロント構成を設計する

**概要**
現状は単一 Next.js アプリに public 候補の閲覧 UI と internal 向け運用 UI が同居している。snapshot 読み取り中心の public 面を切り出せるように構造を整理したい。

**やりたいこと**
- public / internal の責務を明文化
- public 側の対象 API を snapshot 読み取りに限定
- DB read-only user または read replica 方針を決める
- `/ranking` 相当を public 面に載せる前提で依存を棚卸しする
