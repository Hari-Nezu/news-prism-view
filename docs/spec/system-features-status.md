# 実装棚卸し（機能ステータス）

## すでに実装済みの機能

- Go バッチの `run` / `serve`、cron 実行、advisory lock、snapshot 保存
- `processed_snapshots` / `snapshot_groups` / `snapshot_group_items`
- `/api/batch/latest` / `/api/batch/history` / `/api/batch/run` / `/api/batch/inspect`
- `CoverageMatrix` の表示と記事一覧オーバーレイ
- `/compare` と `/api/compare/analyze` による SSE 比較
- `/inspect` の snapshot 詳細点検と軽微な issue 検出、再計算診断 (recompute API)
- `rss_articles` の永続化、cleanup、Go/Next.js 両側からの利用
- `category` / `subcategory` / `groupTitle(topic相当)` の3層構造の大枠
- taxonomy を使ったグルーピング時のカテゴリ減衰
- 主要内容は完了している rss-article-persistence.md
- Go バッチ分類を LLM カスケード分類器へ更新し分類精度を向上
