---
status: current
scope: system
authoritative: true
last_verified: 2026-06-11
verified_against: main@f57460c
---

# 実装棚卸し（機能ステータス）

> 全 API は Go server（`server/internal/handler/`、Port 8091）で提供する。フロントエンドは `API_BASE` 経由で呼ぶ。

## すでに実装済みの機能

- Go バッチの `run` / `serve` / `eval`、cron 実行、advisory lock、snapshot 保存
- `processed_snapshots` / `snapshot_groups` / `snapshot_group_items`
- `GET /api/batch/latest` / `history` / `POST /run` / `GET /inspect`、`POST /inspect/recompute`、`POST /inspect/regroup/{suggest,apply}`
- パイプラインに `refine`（LLM 品質審査）と `consensus`（報道ポイント抽出）ステージを追加（全8段）
- `CoverageMatrix` の表示と記事一覧オーバーレイ、およびオーバーレイからの直接比較機能
- `/compare` と `/api/compare/analyze` による SSE 比較
- `/youtube` ページでの YouTube 動画字幕分析機能
- `/inspect` の snapshot 詳細点検と軽微な issue 検出、再計算診断 (recompute API)
- `rss_articles` の永続化、cleanup、Go/Next.js 両側からの利用
- `category` / `subcategory` / `groupTitle(topic相当)` の3層構造の大枠
- taxonomy を使ったグルーピング時のカテゴリ・ソフトゲートによる異カテゴリ分離
- 主要内容は完了している rss-article-persistence.md
- Go バッチ分類を Embedding -> LLM -> Keyword カスケード分類器へ更新し分類精度を向上
