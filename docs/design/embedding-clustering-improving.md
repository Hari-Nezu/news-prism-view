# embedding 上位近傍クラスタ 設計メモの md 化

## Summary

refine の候補抽出を「近傍 index」から「embedding 上位近傍クラスタ」へ置き換える設計を、独立した Markdown
メモとして docs/memo/ に追加する。
既存の docs/memo/grouping-merge-issue.md の C 案を具体化した続編として扱い、実装前提が迷わない粒度で整理
## Key Changes
- 新規ファイルを docs/memo/refine-nearest-cluster-design.md として追加する。
- 文書には以下を含める。
    - prompt 変更: 隣接クラスタ を 近傍候補クラスタ に変更し、候補の類似度も記載
    - 適用範囲: revise の move/merge/split ロジック自体は変えない
- docs/memo/grouping-merge-issue.md には追記せず、元メモは問題提起、 新メモは実装設計として役割を分け
  る。
- 必要なら新メモの冒頭で @docs/memo/grouping-merge-issue.md を参照し、関連設計であることを明記する。

## Test Plan

- 文書レビュー観点として、実装者が以下を迷わず答えられることを確認する。
    - 候補クラスタをどう選ぶか
    - LLM に何を渡すか
    - target_idx の制約をどう変えるか
    - 既存 group / revise のどこを変えないか
- 受け入れ基準は、文書だけで refine.go の候補抽出変更に着手できること。

## Assumptions

- 配置先は既存メモ群と同じ docs/memo/ を採用する。
- 文書は日本語で記載する。
- 今回は md 化のみで、コード変更や既存メモの大幅な統合は行わない。