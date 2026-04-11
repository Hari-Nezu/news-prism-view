# カバレッジマトリクス 仕様

## 概要

ランキング画面のカバレッジマトリクスは実装済みである。

現状は次の分担になっている。

- `CoverageMatrix`: スナップショット内のニュースグループを媒体別に一覧表示
- マトリクス行クリック: 記事一覧オーバーレイを表示
- `MediaComparisonView`: `/compare` ページで使用
- 記事単位の `📊` 導線: ランキングカードや RSS 一覧側には実装済み

---

## 実装済みの範囲

### 1. CoverageMatrix

`src/components/CoverageMatrix.tsx` では以下を実装済み。

- `NewsGroup[]` を受け取ってマトリクス表示
- `singleOutlet` を除外して多媒体グループのみ表示
- 主要媒体列のみ動的表示
- 行クリックでオーバーレイを開く
- オーバーレイ内で媒体別グリッド表示
- 背景クリックまたは `✕` でオーバーレイを閉じる

### 2. オーバーレイの現状

オーバーレイは記事一覧専用。

状態管理:
```ts
const [selected, setSelected] = useState<NewsGroup | null>(null);
const [mounted, setMounted] = useState(false);
```

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

`src/app/compare/page.tsx` では次を実装済み。

- キーワード検索
- 同一ニュースのグループ化
- グループ選択
- `/api/compare/analyze` を使った SSE 分析
- `MediaComparisonView` による比較結果表示

### 2. 比較 API

`src/app/api/compare/analyze/route.ts` は実装済み。

- 入力: `items: [{ title, url, source, publishedAt }]`
- 件数上限: `1..10`
- 各記事ごとに本文取得 → LLM分析 → SSE送信
- イベント: `progress`, `result`, `error`, `done`
- `sessionId` がある場合のみ比較結果をDB保存

### 3. ランキングカード側の導線

`src/components/RankingHeroCard.tsx` と `RankingMediumCard.tsx` には、記事ごとの `📊` ボタンが実装済み。
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
