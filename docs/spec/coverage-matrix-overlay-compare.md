# カバレッジマトリクス・オーバーレイ比較機能

## 概要

CoverageMatrix のオーバーレイ内から直接 LLM 比較を実行できる機能。

## 実装内容

`src/components/CoverageMatrix.tsx` に以下を実装済み:

- オーバーレイ内の `📊 報道姿勢を比較` ボタン
- `articles / analyzing / results / error` の view state 管理
- `/api/compare/analyze` SSE による分析進捗表示
- 結果表示時に `MediaComparisonView` を埋め込み
- オーバーレイを `max-w-3xl` で表示（記事一覧・比較結果共通）
- `AbortController` による SSE 中断

## 制約

- `/api/compare/analyze` は入力最大10件
- LLM分析は記事数に応じて時間がかかる
- `sessionId` なし呼び出しではDB保存されない
- `singleOutlet` グループでは比較価値が低い
