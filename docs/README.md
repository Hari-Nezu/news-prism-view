---
status: current
scope: system
authoritative: true
last_verified: 2026-06-11
verified_against: main@f57460c
---

# NewsPrism ドキュメント索引

各ドキュメント先頭の front matter に `status` / `scope` / `last_verified` を持つ。状態の意味は下記。

| status | 意味 |
|---|---|
| `current` | 実装済みで現状の真実を反映 |
| `partial` | 一部のみ実装（本文に実装済み/未実装を明示） |
| `proposed` | 計画・提案（未実装） |
| `draft` | 検討中のたたき台 |
| `deprecated` | 過去の設計・判断。現状を表さないが経緯として残す |

> アーキテクチャ前提（2026-06-11）: 全 API は **Go server**（`server/internal/handler/`, :8091）。バッチは **Go**（`batch/`, パイプライン 8段 `collect→embed→classify→group→refine→name→consensus→store` + `eval` サブコマンド）。フロントは Next.js（route group `(public)`/`(internal)`）。embedding は **e5-large（1024次元）**。

## spec/（実装直結の仕様 — current）

| ドキュメント | scope | status |
|---|---|---|
| [system-features-status.md](spec/system-features-status.md) | system | current |
| [batch-pipeline.md](spec/batch-pipeline.md) | feature:batch-pipeline | current |
| [news-categorization.md](spec/news-categorization.md) | feature:classify | current |
| [grouping-inspection.md](spec/grouping-inspection.md) | feature:inspect | current |
| [inspect-regroup.md](spec/inspect-regroup.md) | feature:inspect | current |
| [rss-article-persistence.md](spec/rss-article-persistence.md) | feature:persistence | current |
| [summary-page.md](spec/summary-page.md) | feature:summary | current |
| [coverage-matrix.md](spec/coverage-matrix.md) | feature:coverage | current |
| [coverage-matrix-overlay-compare.md](spec/coverage-matrix-overlay-compare.md) | feature:coverage | current |
| [media-targets.md](spec/media-targets.md) | feature:media | current |

## design/（設計）

| ドキュメント | scope | status |
|---|---|---|
| [consensus-points-ui.md](design/consensus-points-ui.md) | feature:consensus | current |
| [bertopic-subprocess-impl.md](design/bertopic-subprocess-impl.md) | feature:clustering | current（実装済み） |
| [bertopic-comparison.md](design/bertopic-comparison.md) | feature:clustering | current |
| [public-private-separation.md](design/public-private-separation.md) | feature:public-private | partial |
| [grouping-inspection-feedback.md](design/grouping-inspection-feedback.md) | feature:inspect | partial |
| [summary-page-extensions.md](design/summary-page-extensions.md) | feature:summary | partial |
| [implementation-gap-issues.md](design/implementation-gap-issues.md) | system | partial |
| [taxonomy-utilization-extensions.md](design/taxonomy-utilization-extensions.md) | feature:taxonomy | proposed |
| [media-bias-registry.md](design/media-bias-registry.md) | feature:media-bias | proposed |

### design/idea/（未実装の構想）

| ドキュメント | scope | status |
|---|---|---|
| [topic-timeline-consensus.md](design/idea/topic-timeline-consensus.md) | feature:topic-timeline | proposed |
| [parent-topic-angle-structure.md](design/idea/parent-topic-angle-structure.md) | feature:topic-structure | proposed |

## guide/（運用ガイド）

| ドキュメント | scope | status |
|---|---|---|
| [clustering-tuning-playbook.md](guide/clustering-tuning-playbook.md) | feature:clustering | current |

## memo/（作業メモ）

| ドキュメント | scope | status |
|---|---|---|
| [ranking-feed-view.md](memo/ranking-feed-view.md) | feature:ranking | current |
| [decay-and-quality-scoring.md](memo/decay-and-quality-scoring.md) | feature:ranking | partial |
| [youtube-source-design.md](memo/youtube-source-design.md) | feature:youtube | partial |
| [FRONTEND_TEST_PLAN.md](memo/FRONTEND_TEST_PLAN.md) | feature:frontend-test | partial |
| [grouping-merge-issue.md](memo/grouping-merge-issue.md) | feature:clustering | draft |
| [inline-llm-inference.md](memo/inline-llm-inference.md) | feature:llm-runtime | proposed（LLM プロセス内化の正典） |
| [lightweight-classification-routing.md](memo/lightweight-classification-routing.md) | feature:classify | deprecated |
| [NEWS_CLASSIFICATION_TAXONOMY.md](memo/NEWS_CLASSIFICATION_TAXONOMY.md) | feature:classify | deprecated |

## security/（セキュリティレビュー）

| ドキュメント | scope | status |
|---|---|---|
| [security-review-2026-04-12.md](security/security-review-2026-04-12.md) | feature:security | current（SSRF は未修正の可能性 — 要確認） |
| [code-review-2026-04-13.md](security/code-review-2026-04-13.md) | system | current（同上 + Config 全公開） |

## monetization/（事業・戦略 — コード非依存）

| ドキュメント | scope | status |
|---|---|---|
| [monetization-plan.md](monetization/monetization-plan.md) | decision | proposed |
| [ma-scenario.md](monetization/ma-scenario.md) | decision | proposed |
| [news-rights-research.md](monetization/news-rights-research.md) | decision | current（調査） |
| [strongest-media-comparison-vision.md](monetization/strongest-media-comparison-vision.md) | decision | draft |
| [youtube-news-comparison-plan.md](monetization/youtube-news-comparison-plan.md) | decision | proposed |

## その他

- [ONBOARDING.md](ONBOARDING.md) — system / current（環境変数・スキーマ・データフローの正典）

## リポジトリ各所の関連ドキュメント（docs/ 外）

- `batch/README.md`（feature:batch-pipeline / partial）, `batch/EVAL_BATCH.md`（feature:eval / current）, `batch/docs/refine-design.md`（feature:refine / current）, `batch/internal/pipeline/kaizen.md`（feature:refine / draft）
- `server/README.md`（feature:api-server / partial）, `server/TEST_PLAN.md`（feature:api-server-test / partial）
- ルート `README.md` / `SETUP.md` は利用者向け（正典の環境変数は ONBOARDING §3）
