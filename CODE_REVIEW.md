# 全体コードレビュー

日付: 2026-04-13

---

## Critical（致命的バグ）

### C-1: SSRF: `RSS` ハンドラでユーザー指定URLを無検証で fetch

**ファイル:** `server/internal/handler/rss.go:10-22`

```go
feedUrl := r.URL.Query().Get("feedUrl")
parser := gofeed.NewParser()
feed, err := parser.ParseURL(feedUrl)  // ← ユーザー入力をそのまま使用
```

**問題:** `feedUrl` クエリパラメータを検証なく `gofeed.ParseURL` に渡している。内部ネットワーク（`http://169.254.169.254` など AWS metadata service）への SSRF が可能。

**対策:** 
- ホワイトリスト形式で許可する URL プレフィックスを制限
- または `url.Parse` で scheme が `http/https` のみに限定

---

### C-2: `Config` エンドポイントが設定全体を公開

**ファイル:** `server/internal/handler/config.go:5-7`

```go
func (d *Deps) Config_(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, d.Config)  // ← SharedConfig 全体を返す
}
```

**問題:** `SharedConfig` に含まれる `DatabaseURL`、`LLMBaseURL`、API キー、パスワードなどの内部情報がすべて JSON で返される。誰でもアクセス可能。

**対策:** フロントエンドに必要な項目のみを選別して返す構造体を作成

```go
type PublicConfig struct {
	// フロントに必要な項目のみ
}
```

---

### C-3: `classify.go` の `refOnce` がプロセス寿命の間ずっとキャッシュ

**ファイル:** `batch/internal/pipeline/steps/classify.go:29-31`

```go
var (
	refOnce sync.Once
	refVecs []subRef
	refErr  error
)
```

**問題:** `sync.Once` で参照 embedding を一度だけロードするが、taxonomy が変更されてもプロセス再起動まで古いデータが使われ続ける。`serve` モードでは長時間プロセスなので、分類精度が劣化しうる。

**対策:** TTL 付きキャッシュ（例: 1時間で無効化）に変更するか、定期的にリロード

---

### C-4: setState 内の入れ子 setState

**ファイル:** `src/app/page.tsx:117`

```tsx
setArticles((prev) => {
  articleIdx = 0;
  setSelectedIndex(0);  // ← setState コールバック内で別の setState を呼び出し
  return [analyzed, ...prev];
});
```

**問題:** React の state setter のコールバック内で別の `setState` を呼ぶのは非推奨。strict mode での二重実行時に予期しない挙動が発生する。

**対策:** コールバック外で依存関係を整理するか、1つの state にまとめる

```tsx
setArticlesAndIndex((prev) => ({
  articles: [analyzed, ...prev.articles],
  selectedIndex: 0
}));
```

---

## Warning（警告: 動作上の問題・潜在バグ）

### W-1: Graceful shutdown の timeout なし

**ファイル:** `server/cmd/newsprism-server/main.go:64`, `batch/cmd/newsprism-batch/main.go:108`

```go
srv.Shutdown(ctx)  // ctx に timeout がない
```

**問題:** `srv.Shutdown` に渡す `ctx` が `context.Background()` で timeout がない。SSE 接続等が残っている場合、永久にブロックする。

**対策:** timeout 付き context を使用

```go
shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
defer cancel()
srv.Shutdown(shutdownCtx)
```

---

### W-2: `CompareAnalyze` が順次スクレイピング

**ファイル:** `server/internal/handler/compare.go:63-64`

```go
for i, item := range req.Items {
	content, err := scraper.FetchArticleFromUrl(item.URL)  // 順次実行
	if err != nil || len([]rune(content)) < 10 {
		content = item.Title
	}
```

**問題:** 各記事の URL を順次 fetch しており、記事数 × 10秒（scraper タイムアウト）のレイテンシが発生しうる。

**対策:** goroutine でバッチ並行化（例: worker pool パターン）

---

### W-3: `Compare` の `rss.FetchAllFeeds` エラー無視

**ファイル:** `server/internal/handler/compare.go:27`

```go
allItems, _ := rss.FetchAllFeeds(r.Context(), feeds)  // エラーを捨てている
matched := rss.FilterByKeyword(allItems, keyword)
```

**問題:** 全フィード取得失敗時でも空の結果を返してしまう。ユーザーに失敗が伝わらない。

**対策:** エラーをチェックしてログ + エラーレスポンス返送

---

### W-4: `name.go` の並行 LLM 呼び出しに制限なし

**ファイル:** `batch/internal/pipeline/steps/name.go:61-76`

```go
for start := 0; start < len(multi); start += nameChunkSize {
	// ...
	go func(multiSlice []indexedCluster, chunk []Cluster, start int) {
		// LLM 呼び出し（同時実行数制限なし）
	}(multiSlice, chunk, start)
}
```

**問題:** チャンク数分の goroutine を同時に起動するが、制限がない。クラスタ数が多い場合に LLM サーバーに過負荷。

**対策:** semaphore で同時実行数を制限（例: 3-5 並行）

---

### W-5: `InspectPage` の二重ローディングスピナー表示

**ファイル:** `src/app/inspect/page.tsx:365-376`

```tsx
{open && !detail && inspectCache.has(groupId) === false && (
  <div>...</div>  // スピナー1
)}
{open && !inspectCache.has(groupId) && (
  <div>...</div>  // スピナー2（同時表示される）
)}
```

**問題:** 2つのローディング条件が実質同じため、スピナーが重複表示される。

**対策:** 条件を明確に分離

```tsx
{open && !inspectCache.has(groupId) && (
  <div><!-- fetch 中 --></div>
)}
{open && inspectCache.has(groupId) && inspectCache.get(groupId) === null && (
  <div><!-- エラー状態 --></div>
)}
```

---

### W-6: `PositioningPlot` のフック配列違反

**ファイル:** `src/components/PositioningPlot.tsx:276`

```tsx
const svgRefs = [useRef<SVGSVGElement>(null), useRef<SVGSVGElement>(null)];
```

**問題:** React Hooks ルール違反。配列リテラル内での useRef 呼び出しは禁止。`PLOTS` 長が変わると壊れる。

**対策:** 個別の変数に分割するか、`useCallback` で管理

```tsx
const svgRef0 = useRef<SVGSVGElement>(null);
const svgRef1 = useRef<SVGSVGElement>(null);
const svgRefs = [svgRef0, svgRef1];
```

---

### W-7: `FeedSettingsDrawer` の URL バリデーション不足

**ファイル:** `src/components/FeedSettingsDrawer.tsx:100`

```ts
try { new URL(url); } catch { alert("有効な URL を入力してください"); return; }
```

**問題:** `new URL("javascript:alert(1)")` は例外を投げない。`javascript:` スキームの XSS が可能。

**対策:** スキームの明示チェック

```ts
try {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only HTTP/HTTPS allowed');
  }
} catch { ... }
```

---

### W-8: `formatRelative` の3箇所重複

**ファイル:** 
- `src/components/RankingHeroCard.tsx:156-164`
- `src/components/RankingMediumCard.tsx:134-142`
- `src/lib/format-time.ts`

**問題:** 同一ロジックが3箇所に存在。仕様変更時に diverge するリスク。

**対策:** 共通の関数をインポートして使用

---

### W-9: `parse-sse.ts` が未使用

**ファイル:** `src/lib/parse-sse.ts`

**問題:** 共通化された SSE パーサーがあるのに、実際の SSE 処理箇所（`page.tsx`, `compare/page.tsx`, `youtube/page.tsx`, `CoverageMatrix.tsx`）はすべて独自にインライン実装。

**対策:** 各所で `parseSSEBuffer` を使用するよう統一

---

### W-10: `MediaComparisonView` の空配列時に `-Infinity` 表示

**ファイル:** `src/components/MediaComparisonView.tsx:231-233`

```tsx
const gaps = (["economic", "social", "diplomatic"] as const).map((key) => {
  const vals = results.map((r) => r.analysis.scores[key]);
  return Math.max(...vals) - Math.min(...vals);  // results 空時: -Infinity
});
```

**問題:** `results` が空の場合、`Math.max(...[])` が `-Infinity` を返し、UI に表示される。

**対策:** 事前チェック

```tsx
if (results.length === 0) return null;
```

---

### W-11: `compare/page.tsx` の「別のグループを比較」で空配列リセット

**ファイル:** `src/app/compare/page.tsx:299`

```tsx
onClick={() => setStep({ type: "grouped", groups: [] })}
```

**問題:** `groups: []` で元の検索結果を失い、「0件のニュースグループが見つかりました」と表示される。

**対策:** 直前の groups を保持して戻る

```tsx
const [lastGroups, setLastGroups] = useState<NewsGroup[]>([]);
// ...
onClick={() => setStep({ type: "grouped", groups: lastGroups })}
```

---

## Minor（軽微な問題）

### M-1: `float64` の等値比較

**ファイル:** `batch/internal/pipeline/steps/store.go:73`

```go
if a.finalScore != b.finalScore {
	return a.finalScore > b.finalScore
}
```

**問題:** 浮動小数点の `!=` 比較は精度誤差で予期しない結果になりうる。

**対策:** 差分の閾値比較

```go
const epsilon = 1e-9
if math.Abs(a.finalScore - b.finalScore) > epsilon {
	return a.finalScore > b.finalScore
}
```

---

### M-2: `classify.go` の `min` 関数が Go 1.21+ builtin と衝突

**ファイル:** `batch/internal/pipeline/steps/classify.go:366-371`

```go
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
```

**問題:** Go 1.21 で `min`/`max` が builtin 追加。shadowing が発生し紛らわしい。

**対策:** 関数名を `minInt` に変更するか、builtin を使用

```go
result := slices.Min(lengths)  // Go 1.21+
```

---

### M-3: `RssFeedPanel` の `border-3` が Tailwind v4 で無効

**ファイル:** `src/components/RssFeedPanel.tsx:350`

```tsx
<div className="w-8 h-8 border-3 border-gray-200 border-t-blue-500 rounded-full animate-spin mb-4" />
```

**問題:** Tailwind v4 では `border-3` は存在しない。無視される。

**対策:** 任意値記法を使用

```tsx
className="w-8 h-8 border-[3px] border-gray-200 border-t-blue-500 rounded-full animate-spin mb-4"
```

---

### M-4: ダークモードが `bg-gray-50` で上書き

**ファイル:** `src/app/layout.tsx:31` + `src/app/globals.css:15-20`

```tsx
<body className="bg-gray-50">
```

```css
@media (prefers-color-scheme: dark) {
  :root { --background: #0a0a0a; }
}
```

**問題:** CSS 変数で定義したダークモード背景が `bg-gray-50` で上書きされる。

**対策:** body に背景色クラスを指定しない、または `bg-[var(--background)]` を使用

---

### M-5: `topic-classifier.ts` のコメント矛盾

**ファイル:** `src/lib/topic-classifier.ts:118-119`

```ts
// 優先度順（先にマッチしたものが採用される）
// disaster は自然災害に限定するため politics/economy より後ろ
export const TOPIC_ORDER: string[] = [
  "disaster",  // ← でも先頭
```

**問題:** 日本語コメントは後ろと説明、実装は先頭。英語コメントで優先度を上げたとあるが矛盾。

**対策:** コメント統一

```ts
// 優先度順（先にマッチしたものが採用される）
// disaster は迅速なアラート必要なため最優先
```

---

### M-6: `NewsGroupCard` の日付ソートが辞書順

**ファイル:** `src/components/NewsGroupCard.tsx:13-16`

```ts
const latestDate = group.items
  .map((i) => i.publishedAt)
  .filter(Boolean)
  .sort()
  .at(-1);
```

**問題:** `.sort()` がデフォルトの文字列比較。
ISO 8601 なら正しいが、RFC 2822 形式が混入すると壊れる。

**対策:** 数値ソート

```ts
.sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
```

---

### M-7: `stringToHue` のハッシュ関数でオーバーフロー

**ファイル:** `src/lib/source-colors.ts:58-63`

```ts
function stringToHue(str: string): number {
  let hash = 5381;
  for (const c of str) {
    hash = (hash * 33) ^ c.charCodeAt(0);  // 浮動小数点精度損失
  }
  return Math.abs(hash) % 360;
}
```

**問題:** `hash * 33` で `Number.MAX_SAFE_INTEGER` を超え、ビット演算の精度が失われる。

**対策:** 32ビット符号なし整数にクランプ

```ts
hash = ((hash * 33) ^ c.charCodeAt(0)) >>> 0;  // 32bit unsigned
```

---

### M-8: `ArticleHistory` / `CompareHistory` のエラーハンドリング欠如

**ファイル:** 
- `src/components/ArticleHistory.tsx:18-27`
- `src/components/CompareHistory.tsx:24-33`

**問題:** `fetch` 失敗時にユーザーへのエラー表示がない。ローディング解除のみで、ユーザーは失敗に気づけない。

**対策:** エラー状態を管理・表示

```tsx
const [error, setError] = useState<string | null>(null);
const [loading, setLoading] = useState(false);

const load = async () => {
  try {
    // ...
  } catch (e) {
    setError(e instanceof Error ? e.message : "読み込みに失敗しました");
  }
};
```

---

## 対応優先度

1. **即座に対応すべき（Security）**
   - C-1: SSRF
   - C-2: Config 漏洩

2. **早期対応推奨（Correctness）**
   - C-3: classify キャッシュ
   - C-4: setState 入れ子
   - W-1: Graceful shutdown timeout
   - W-6: Hooks ルール違反

3. **中期対応（Code Quality）**
   - W-2, W-3, W-4: スクレイピング並行化・エラーハンドリング
   - W-8, W-9: コード重複排除
   - M-3, M-4: Tailwind v4 対応

4. **Low Priority（Style / Minor）**
   - M-1, M-2, M-5, M-6, M-7, M-8
