# カバレッジマトリクス内の報道姿勢比較機能

## 概要

ランキング画面（まとめ）のカバレッジマトリクスで、トピック行をクリック→記事一覧表示のオーバーレイ内に**「報道姿勢を比較」ボタン**を配置。クリックするとそのトピックの全記事を LLM で分析し、媒体ごとの報道スタンス（3 軸スコア）を可視化する。

## フロー図

```
ranking ページ
    ↓
報道カバレッジマトリクス（マトリクス行クリック）
    ↓
┌─ オーバーレイ: 記事一覧ビュー ───────────────────────┐
│ ・媒体別グリッド表示（既存）                         │
│ ・[📊 報道姿勢を比較] ボタン                          │
│                                                    │
│ クリック ↓                                          │
│                                                    │
│ ┌─ 分析中ビュー ─────────────────────────────────┐ │
│ │ プログレスバー + 各媒体の進捗                   │ │
│ └──────────────────────────────────────────────┘ │
│                                                    │
│ ↓ 完了                                             │
│                                                    │
│ ┌─ 結果ビュー ──────────────────────────────────┐ │
│ │ MediaComparisonView                          │ │
│ │  - D3 散布図 2 枚（社会×経済、外交×経済）    │ │
│ │  - スコア比較バー                             │ │
│ │  - 媒体別要約 + カウンターオピニオン         │ │
│ │ [← 記事一覧に戻る]                            │ │
│ └──────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
    ↓
✕ or 背景クリック → オーバーレイ閉じる
```

## 技術設計

### 1. CoverageMatrix のステート拡張

#### 現在のステート
```typescript
const [selected, setSelected] = useState<NewsGroup | null>(null);
const [mounted, setMounted] = useState(false);
```

#### 拡張後のステート
```typescript
type OverlayView =
  | { view: "articles"; group: NewsGroup }
  | { view: "analyzing"; group: NewsGroup; progress: number; total: number }
  | { view: "results"; group: NewsGroup; results: AnalyzedArticle[] }
  | { view: "error"; group: NewsGroup; message: string };

const [overlay, setOverlay] = useState<OverlayView | null>(null);
const [mounted, setMounted] = useState(false);
const abortRef = useRef<AbortController | null>(null);
```

### 2. ビューの描画分岐

オーバーレイ内で `overlay.view` に応じて 4 つの UI を出し分け：

#### A. `articles` ビュー（現在のオーバーレイ + ボタン）

```jsx
<div className="...">
  {/* ヘッダ: グループ名 + 閉じるボタン */}
  <div className="flex items-start gap-3 px-5 py-4 border-b border-gray-100">
    <div className="flex-1 min-w-0">
      <p className="text-sm font-bold">{overlay.group.groupTitle}</p>
      <p className="text-xs text-gray-400">{sourceCount}媒体 / {itemCount}件</p>
    </div>
    <button onClick={() => handleClose()}>✕</button>
  </div>

  {/* 報道姿勢比較ボタン（singleOutlet でない場合のみ） */}
  {!overlay.group.singleOutlet && (
    <div className="px-5 py-4 border-b border-gray-100 bg-purple-50/30">
      <button
        onClick={() => handleStartAnalysis(overlay.group)}
        className="w-full px-4 py-2.5 bg-purple-600 text-white text-sm font-semibold rounded-xl hover:bg-purple-700 transition-colors"
      >
        📊 報道姿勢を比較
      </button>
      <p className="text-xs text-gray-500 mt-2">
        各メディアの報道スタンスを AI で分析します（1〜2分）
      </p>
    </div>
  )}

  {/* 記事グリッド（既存） */}
  <div className="overflow-y-auto p-4">
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {/* ... */}
    </div>
  </div>
</div>
```

#### B. `analyzing` ビュー（進捗表示）

```jsx
<div className="...">
  {/* ヘッダ + 戻るボタン */}
  <div className="flex items-start gap-3 px-5 py-4 border-b border-gray-100">
    <button onClick={() => setOverlay({ view: "articles", group: overlay.group })}>
      ← 記事一覧
    </button>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-bold">{overlay.group.groupTitle}</p>
    </div>
    <button onClick={() => handleClose()}>✕</button>
  </div>

  {/* プログレス */}
  <div className="p-6">
    <div className="flex items-center justify-between mb-3">
      <p className="text-sm font-semibold">各媒体の記事を分析中</p>
      <span className="text-xs text-gray-400">{overlay.progress}/{overlay.total}</span>
    </div>

    {/* プログレスバー */}
    <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-4">
      <div
        className="h-2 bg-purple-500 rounded-full transition-all"
        style={{ width: `${(overlay.progress / overlay.total) * 100}%` }}
      />
    </div>

    {/* 各記事のステータス */}
    <div className="space-y-2">
      {overlay.group.items.map((item, i) => (
        <div key={i} className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${
          i < overlay.progress ? "bg-green-50 text-green-700"
            : i === overlay.progress ? "bg-purple-50 text-purple-700"
            : "bg-gray-50 text-gray-400"
        }`}>
          {i < overlay.progress ? (
            <span>✓</span>
          ) : i === overlay.progress ? (
            <div className="w-4 h-4 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin" />
          ) : (
            <span>○</span>
          )}
          <span className="font-medium">{item.source}</span>
          <span className="truncate">{item.title.slice(0, 30)}...</span>
        </div>
      ))}
    </div>
  </div>
</div>
```

#### C. `results` ビュー（MediaComparisonView 埋め込み）

```jsx
<div className="...">
  {/* ヘッダ */}
  <div className="flex items-start gap-3 px-5 py-4 border-b border-gray-100">
    <button
      onClick={() => setOverlay({ view: "articles", group: overlay.group })}
      className="text-sm text-purple-600 font-medium"
    >
      ← 記事一覧に戻る
    </button>
    <div className="flex-1" />
    <button onClick={() => handleClose()}>✕</button>
  </div>

  {/* MediaComparisonView 表示 */}
  <div className="overflow-y-auto p-6">
    <MediaComparisonView group={overlay.group} results={overlay.results} />
  </div>
</div>
```

#### D. `error` ビュー（エラー表示）

```jsx
<div className="...">
  {/* ヘッダ */}
  <div className="flex items-start gap-3 px-5 py-4 border-b border-gray-100">
    <button onClick={() => setOverlay({ view: "articles", group: overlay.group })}>
      ← 記事一覧に戻る
    </button>
    <div className="flex-1" />
    <button onClick={() => handleClose()}>✕</button>
  </div>

  {/* エラーメッセージ */}
  <div className="p-6">
    <div className="rounded-2xl bg-red-50 border border-red-200 px-5 py-4">
      <p className="text-sm font-semibold text-red-700 mb-1">分析エラーが発生しました</p>
      <p className="text-xs text-red-600">{overlay.message}</p>
      <button
        onClick={() => handleStartAnalysis(overlay.group)}
        className="mt-4 text-xs font-medium text-red-600 hover:text-red-800"
      >
        再試行 →
      </button>
    </div>
  </div>
</div>
```

### 3. 分析ロジック（SSE 読み取り）

compare ページの `handleSelectGroup` パターンをそのまま CoverageMatrix 内に実装。

```typescript
async function handleStartAnalysis(group: NewsGroup) {
  const ctrl = new AbortController();
  abortRef.current = ctrl;

  setOverlay({
    view: "analyzing",
    group,
    progress: 0,
    total: group.items.length,
  });

  const results: AnalyzedArticle[] = [];

  try {
    const res = await fetch("/api/compare/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: group.items.map((i) => ({
          title: i.title,
          url: i.url,
          source: i.source,
          publishedAt: i.publishedAt,
        })),
      }),
      signal: ctrl.signal,
    });

    if (!res.ok || !res.body) throw new Error("分析APIへの接続に失敗しました");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line.startsWith("event: ")) continue;
        if (!line.startsWith("data: ")) continue;

        try {
          const payload = JSON.parse(line.slice(6));
          if ("article" in payload) {
            results.push(payload.article as AnalyzedArticle);
            setOverlay({
              view: "analyzing",
              group,
              progress: results.length,
              total: group.items.length,
            });
          } else if ("total" in payload && !("index" in payload)) {
            setOverlay({ view: "results", group, results });
          }
        } catch {
          // ignore parse errors
        }
      }
    }

    if (results.length > 0) {
      setOverlay({ view: "results", group, results });
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      // キャンセルされた
      setOverlay({ view: "articles", group });
    } else {
      setOverlay({
        view: "error",
        group,
        message: err instanceof Error ? err.message : "分析中にエラーが発生しました",
      });
    }
  }
}
```

### 4. オーバーレイクローズ時の処理

```typescript
function handleClose() {
  // SSE 中断
  abortRef.current?.abort();
  abortRef.current = null;
  setOverlay(null);
}
```

### 5. オーバーレイ幅の動的調整

結果表示時は D3 プロットが 2 枚横に並ぶため幅を拡張。

```jsx
<div
  className={`bg-white rounded-2xl shadow-2xl w-full flex flex-col overflow-hidden ${
    overlay?.view === "results" ? "max-w-5xl" : "max-w-3xl"
  }`}
  style={{ maxHeight: "90vh" }}
>
  {/* ... */}
</div>
```

## データフロー

### 既存の `/api/compare/analyze` を再利用

CoverageMatrix からの呼び出しは compare ページと同じ。**新規 API ルート不要。**

```
POST /api/compare/analyze
├─ 入力: { items: RssFeedItem[] }
├─ 処理: 各記事を
│        ├─ fetchArticleFromUrl() で本文取得
│        ├─ analyzeArticle() で LLM 分析
│        └─ SSE 送信
└─ 出力: event-stream
         ├─ "progress"
         ├─ "result" → AnalyzedArticle
         ├─ "error"
         └─ "done"
```

### MediaComparisonView をそのまま再利用

結果表示時は既存の `MediaComparisonView` コンポーネントを埋め込むだけ。

```tsx
<MediaComparisonView group={overlay.group} results={overlay.results} />
```

## 実装ファイル変更

| ファイル | 変更内容 |
|:--|:--|
| `src/components/CoverageMatrix.tsx` | ステート拡張 + 4 ビューの描画分岐 + SSE ロジック + AbortController |

**その他のファイルは変更不要。** `/api/compare/analyze`、`MediaComparisonView`、その他ユーティリティはそのまま再利用。

## UI/UX 仕様

### 記事一覧ビューのボタン配置

- **位置:** ヘッダと記事グリッドの間
- **サイズ:** 幅 100%（フルワイド）
- **テキスト:** 📊 報道姿勢を比較
- **説明文:** 各メディアの報道スタンスを AI で分析します（1〜2分）
- **表示条件:** `singleOutlet === false` かつグループに複数記事が含まれる場合のみ

### オーバーレイサイズ

- **記事一覧/分析中:** `max-w-3xl`（既存）
- **結果:** `max-w-5xl`（拡張、D3 プロット 2 枚のため）
- **高さ:** `max-h-[80vh]` → オーバーフロー時スクロール可

### キャンセル動作

- 分析中に **✕ ボタン** クリック → SSE 中断（`AbortController.abort()`）→ 記事一覧に戻る
- **背景クリック** → オーバーレイ閉じる（SSE 中断）

## エラーハンドリング

| エラー | 対応 |
|:--|:--|
| ネットワークエラー | エラービューで "分析API への接続に失敗しました" を表示 |
| 記事取得失敗 | 該当記事をスキップ、他の記事は分析継続（比較ページと同じ） |
| LLM タイムアウト | エラービュー、再試行ボタン提供 |
| AbortError（キャンセル） | サイレント → 記事一覧ビューへ |

## パフォーマンス考慮

- **並列埋め込み:** `/api/compare/analyze` 内で LLM 分析後、embedArticle を非ブロッキングで実行（既存実装）
- **SSE ストリーミング:** 各記事の分析完了ごとに UI 更新（進捗リアルタイム表示）
- **AbortController:** ユーザーキャンセル時に fetch を中止、リソース浪費を防止

## 制約 / 注意事項

- **singleOutlet グループ:** 比較対象がないため、ボタン非表示
- **記事数上限:** `/api/compare/analyze` の入力は最大 10 件（既存制約）
- **分析時間:** 通常 1〜2 分（LLM 呼び出し数に比例）
- **キャッシュ:** DB 保存は sessionId ベース（オーバーレイからの呼び出しは sessionId なしで保存されない）

## 検証方法

1. **記事一覧ビュー**
   - マトリクス行クリック → オーバーレイ表示
   - 記事グリッド + 報道姿勢比較ボタン確認
   - singleOutlet グループはボタン非表示確認

2. **分析開始**
   - ボタンクリック → 分析中ビューに遷移
   - プログレスバー + 各記事ステータス進捗確認

3. **結果表示**
   - 分析完了 → 結果ビュー遷移
   - D3 プロット 2 枚 + スコア表 + 要約カード表示確認
   - オーバーレイ幅が拡張されている確認（max-w-5xl）

4. **戻る / 閉じる**
   - 「記事一覧に戻る」クリック → articles ビューに遷移
   - ✕ ボタンクリック → オーバーレイ閉じる
   - 分析中に ✕ → SSE 中断、記事一覧へ

5. **エラー時**
   - ネットワーク障害シミュレート → エラービュー表示
   - 再試行ボタン → 分析再開

## 実装フェーズ

**Phase 1:** CoverageMatrix 内 OverlayState 設計 + ビュー分岐実装
**Phase 2:** SSE ロジック・AbortController 実装
**Phase 3:** UI/UX ポーランド + エラーハンドリング

---

この設計により、ユーザーは**マトリクス → オーバーレイ内で完結する分析フロー**を体験でき、compare ページへの遷移なしに報道姿勢を比較できます。
