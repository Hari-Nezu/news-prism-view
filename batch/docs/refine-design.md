# Agentic Clustering Loop 設計

## 現状の問題

1. **グリーディ一発勝負** — 処理順序で結果が変わる、後戻りなし
2. **カテゴリ誤分類の波及** — classify の誤りがクラスタ品質を直撃
3. **意味的に異質な記事の混入** — 閾値だけでは防げないケース（kaizen.md の高市首相事例）

## 提案: Critique → Revise ループ

```
[既存パイプライン]
  collect → embed → classify → group(greedy)
                                   ↓
                            ┌─────────────┐
                            │  Critique   │ LLMがクラスタを検査
                            │  (批評)     │ → 問題リスト生成
                            └──────┬──────┘
                                   │ 問題なし → 終了
                                   │ 問題あり ↓
                            ┌─────────────┐
                            │   Revise    │ 問題に基づき
                            │  (修正)     │ split / merge / move
                            └──────┬──────┘
                                   │
                                   ↓ ループ (最大N回)
                            ┌─────────────┐
                            │  Critique   │ 再検査
                            └─────────────┘
```

## 各ステップの詳細

### Critique ステップ

LLMにクラスタ単位で以下を判定させる:

```go
type CritiqueResult struct {
    ClusterIdx  int
    Verdict     string   // "coherent" | "split" | "merge" | "move"
    Reason      string
    TargetIdx   *int     // merge/move先
    OutlierURLs []string // split/move対象の記事
}
```

**プロンプト設計** — クラスタ内の記事タイトル一覧を渡し、以下を問う:
- このクラスタは1つのニューストピックか？
- 混ざっている記事はあるか？（→ `split` or `move`）
- 他のクラスタと統合すべきか？（→ `merge`、隣接クラスタのタイトルも提示）

**入力削減**: 全クラスタを一度に渡すとトークン爆発するので、チャンク処理（現行nameステップと同様に15件単位）。ただし `merge` 判定のために隣接チャンクのタイトルも参考情報として付与。

### Revise ステップ

Critique結果を機械的に適用:

| Verdict | 処理 |
|---------|------|
| `coherent` | 何もしない |
| `split` | OutlierURLs の記事を元クラスタから除外し、新クラスタを生成。セントロイド再計算 |
| `merge` | TargetIdx のクラスタに記事を統合。セントロイド再計算 |
| `move` | OutlierURLs の記事を TargetIdx へ移動。両クラスタのセントロイド再計算 |

Revise は LLM不要。構造体操作のみ。

### 収束条件

```go
const maxCritiqueRounds = 2  // 最大2回（実用上1回で十分なはず）

for round := 0; round < maxCritiqueRounds; round++ {
    critiques := critique(clusters)
    actions := filterActionable(critiques) // coherent以外
    if len(actions) == 0 {
        break
    }
    clusters = revise(clusters, actions)
}
```

## パイプラインへの組み込み

```
collect → embed → classify → group → critique/revise loop → name → store
                                      ^^^^^^^^^^^^^^^^^^^^^^^^
                                      新規追加（groupとnameの間）
```

既存の `group.go` は変更しない。新規ステップ `refine.go` を追加。

```
batch/internal/pipeline/steps/
  refine.go          // Critique + Revise ループ
  refine_test.go
```

## コスト/レイテンシの見積もり

- Critique 1回あたり: クラスタ数 ÷ 15チャンク × 1 LLM呼び出し
- 現状の平均クラスタ数が30前後なら、2チャンク × 最大2ラウンド = **最大4 LLM呼び出し追加**
- name ステップの既存コストと同程度

## 設計判断のポイント

| 判断 | 理由 |
|------|------|
| グリーディ初回を残す | embedding類似度だけで8割は正しい。LLMは残り2割の修正に集中 |
| Critiqueはタイトルのみ | embeddingは既にgroup段階で使用済み。LLMにはタイトルの意味理解で補完させる |
| 最大2ラウンド | 収束しないループを防止。実測後に調整 |
| Reviseにカテゴリ再判定なし | スコープを絞る。カテゴリ修正は別課題 |
