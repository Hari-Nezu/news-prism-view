# カバレッジマトリクスと報道姿勢比較

## 概要

ランキング画面のカバレッジマトリクスは **実装済み**。  
一方で、マトリクスのオーバーレイ内からそのまま LLM 比較に入る導線は **未実装** である。

現状は次の分担になっている。

- `CoverageMatrix`: スナップショット内のニュースグループを媒体別に一覧表示
- マトリクス行クリック: 記事一覧オーバーレイを表示
- `MediaComparisonView`: `/compare` ページで使用
- 記事単位の `📊` 導線: ランキングカードや RSS 一覧側には実装済み

---

## 実装済みの範囲

### 1. CoverageMatrix

[CoverageMatrix.tsx](/Users/mk/Development/NewsPrismView/news-prism-view/src/components/CoverageMatrix.tsx) では以下を実装済み。

- `NewsGroup[]` を受け取ってマトリクス表示
- `singleOutlet` を除外して多媒体グループのみ表示
- 主要媒体列のみ動的表示
- 行クリックでオーバーレイを開く
- オーバーレイ内で媒体別グリッド表示
- 背景クリックまたは `✕` でオーバーレイを閉じる

### 2. オーバーレイの現状

オーバーレイは **記事一覧専用** で、状態は次の2つだけ。

```ts
const [selected, setSelected] = useState<NewsGroup | null>(null);
const [mounted, setMounted] = useState(false);
```

つまり、以前の設計案にあった以下はまだ入っていない。

- `articles / analyzing / results / error` の4ビュー切り替え
- `AbortController`
- SSE 読み取り
- `MediaComparisonView` の埋め込み

### 3. 現在のオーバーレイ仕様

- 幅: `max-w-3xl`
- 高さ: `max-h-[80vh]`
- 描画方式: `createPortal(..., document.body)`
- 記事一覧: `groupItemsBySource()` で媒体別にグルーピング
- 各記事: タイトル、相対時刻、外部リンクのみ表示

---

## 既にある比較機能

CoverageMatrix 内には比較機能がないが、比較そのものはすでに別経路で存在する。

### 1. compare ページ

[compare/page.tsx](/Users/mk/Development/NewsPrismView/news-prism-view/src/app/compare/page.tsx) では次を実装済み。

- キーワード検索
- 同一ニュースのグループ化
- グループ選択
- `/api/compare/analyze` を使った SSE 分析
- `MediaComparisonView` による比較結果表示

### 2. 比較 API

[/api/compare/analyze](/Users/mk/Development/NewsPrismView/news-prism-view/src/app/api/compare/analyze/route.ts) は実装済み。

- 入力: `items: [{ title, url, source, publishedAt }]`
- 件数上限: `1..10`
- 各記事ごとに本文取得 → LLM分析 → SSE送信
- イベント: `progress`, `result`, `error`, `done`
- `sessionId` がある場合のみ比較結果をDB保存

### 3. ランキングカード側の導線

[RankingHeroCard.tsx](/Users/mk/Development/NewsPrismView/news-prism-view/src/components/RankingHeroCard.tsx) と [RankingMediumCard.tsx](/Users/mk/Development/NewsPrismView/news-prism-view/src/components/RankingMediumCard.tsx) には、記事ごとの `📊` ボタンが実装済み。

これは「グループ全体比較」ではなく、記事を compare ページへ持ち込むための導線である。

---

## 現状のデータフロー

### CoverageMatrix

```text
GET /api/batch/latest
  → groups: NewsGroup[]
  → CoverageMatrix
  → 行クリック
  → 記事一覧オーバーレイ
```

### compare ページ

```text
/compare
  → GET /api/compare?keyword=...
  → グループ選択
  → POST /api/compare/analyze
  → SSE
  → MediaComparisonView
```

---

## 未実装の設計案

以前の案として、CoverageMatrix のオーバーレイにそのまま比較機能を入れる構想があった。  
現時点では以下は **未実装**。

- オーバーレイ内の `📊 報道姿勢を比較` ボタン
- オーバーレイ内での分析進捗表示
- オーバーレイ内での `MediaComparisonView` 表示
- オーバーレイを比較結果に応じて `max-w-5xl` へ拡張
- `AbortController` による SSE 中断

---

## もし今後実装するなら

CoverageMatrix 側に比較機能を入れる場合は、新規 API は不要で、既存の [/api/compare/analyze](/Users/mk/Development/NewsPrismView/news-prism-view/src/app/api/compare/analyze/route.ts) を再利用できる。

必要な変更先は主に [CoverageMatrix.tsx](/Users/mk/Development/NewsPrismView/news-prism-view/src/components/CoverageMatrix.tsx)。

### 追加が必要なもの

- `selected` だけでなく `overlay view` を持つ状態管理
- `articles / analyzing / results / error` の描画分岐
- SSE 読み取りロジック
- `AbortController`
- `MediaComparisonView` の埋め込み

### 現実的な制約

- `/api/compare/analyze` は入力最大10件
- LLM分析は記事数に応じて時間がかかる
- `sessionId` なし呼び出しではDB保存されない
- `singleOutlet` グループでは比較価値が低い

---

## 現在の結論

- カバレッジマトリクス表示は実装済み
- マトリクスのオーバーレイ内比較は未実装
- 比較機能そのものは `/compare` と `/api/compare/analyze` で実装済み
- ランキング系UIには記事単位の `📊` 導線がある

この文書は今後、CoverageMatrix 内比較を本当に着手するタイミングで、設計詳細を追加すればよい。
