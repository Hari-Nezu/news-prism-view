# Goバッチ: カテゴリ制約付きクラスタリング導入メモ（2026-04-09）

## 目的

同一トピック判定のクラスタに、明らかに別ニュースの記事が混入している。
まずは Go バッチの grouping で「同一カテゴリ内でのみ clustering する」制約を入れ、異カテゴリ混入を強く抑える。

これは最終解ではなく、誤混入を先に減らすための第1段階とする。

## 現状認識

対象実装:

- `batch/internal/pipeline/classify.go`
- `batch/internal/pipeline/group.go`
- `batch/internal/pipeline/pipeline.go`
- `src/lib/db.ts`

現状の問題:

- Go バッチの分類はキーワードベースで、`category` は入るが `subcategory` は未活用
- clustering は `batch/internal/pipeline/group.go` で greedy cosine similarity を使っている
- 異カテゴリでも禁止されず、`sim *= 0.7` のソフト減衰だけで同一クラスタに入りうる
- UI 側 inspect では `cross_category_mismatch` を issue 扱いしており、期待仕様と実装がズレている

現状ロジックの本質:

- `a.Category != c.DomCat` でも similarity が十分高ければ merge される
- その結果、embedding が近いだけの別ニュースが同一 group になりうる
- 特に Go 側分類が粗いため、政治/国際/社会など境界の近い話題で事故が起きやすい

## 方針

### 結論

第1段階では、grouping の merge 条件を次のように変える。

- `category` が両方とも有効な場合は、同一 `category` のクラスタにしか join させない
- `other` または空文字は「未確定カテゴリ」とみなし、例外レーンとして扱う
- 例外レーンでは merge をかなり厳しくする

### 期待する効果

- 明らかな異カテゴリ混入が大きく減る
- inspect で出ている `cross_category_mismatch` が減る
- cluster title の意味が安定しやすくなる

### 想定される副作用

- 本来同一イベントでも、分類ミスがあると別クラスタに分かれる
- 特に `other` が多い間は過分割が起きやすい

この副作用は許容する。現状は「過結合」の害が大きいため、まずは「多少分かれすぎる」側に倒す。

## 変更仕様

### 1. カテゴリ互換判定を導入する

`batch/internal/pipeline/group.go` にカテゴリ互換判定関数を追加する。

想定仕様:

```go
func normalizedCategory(cat string) string
func isUnknownCategory(cat string) bool
func canJoinCluster(articleCat string, clusterCat string) bool
```

ルール:

- `""` は unknown
- `"other"` は unknown
- unknown 同士は join 候補にしてよい
- unknown と既知カテゴリの組み合わせは、第1段階では join 不可
- 既知カテゴリ同士は完全一致時のみ join 可

つまり第1段階の `canJoinCluster` は以下と同義:

```go
if isUnknownCategory(articleCat) || isUnknownCategory(clusterCat) {
    return isUnknownCategory(articleCat) && isUnknownCategory(clusterCat)
}
return normalizedCategory(articleCat) == normalizedCategory(clusterCat)
```

### 2. similarity penalty をやめて hard gate にする

現状:

```go
if a.Category != "" && a.Category != "other" &&
	c.DomCat != "other" && a.Category != c.DomCat {
	sim *= 0.7
}
```

変更後:

- カテゴリ不一致クラスタは similarity 計算対象から除外する
- hard gate を通過したクラスタだけに対して cosine similarity を比較する

疑似コード:

```go
for i, c := range clusters {
    if len(c.Centroid) == 0 {
        continue
    }
    if !canJoinCluster(a.Category, c.DomCat) {
        continue
    }
    sim := float64(cosineSim(a.Embedding, c.Centroid))
    if sim > bestSim {
        bestIdx, bestSim = i, sim
    }
}
```

### 3. unknown category は高閾値レーンにする

unknown 同士を完全に merge 禁止にすると単独クラスタが増えすぎる可能性がある。
そのため unknown レーンだけ別閾値を使う。

追加案:

- 通常カテゴリの閾値: 既存 `cfg.GroupClusterThreshold`
- unknown レーン専用閾値: `cfg.GroupClusterThreshold + 0.05`

例:

- 通常: `0.87`
- unknown: `0.92`

この差分は最初はハードコードでもよいが、できれば config 化する。

候補:

- `UNKNOWN_CATEGORY_CLUSTER_THRESHOLD`

ただし第1段階では env を増やしすぎない方がよい。初回実装は `threshold + 0.05` を `group.go` 内で扱ってもよい。

### 4. dominant category 更新ロジックは維持する

`DomCat` 自体は引き続き cluster の代表カテゴリとして持つ。

ただし前提が変わる:

- 既知カテゴリクラスタには同一カテゴリ記事しか入らない
- unknown クラスタには unknown しか入らない

このため `dominantCat()` の結果は今より意味が明確になる。

### 5. inspect の期待値も更新する

実装後も `cross_category_mismatch` 検出は残す。

理由:

- 既存 snapshot に対する後方互換
- 将来のデータ移行ミス検知
- 他ルートからのデータ混入検知

ただし新規 snapshot では `cross_category_mismatch` の発生率が大幅に下がることを期待する。

## 実装対象

### 必須変更

1. `batch/internal/pipeline/group.go`

- `isUnknownCategory`
- `normalizedCategory`
- `canJoinCluster`
- unknown 用閾値分岐
- hard gate 化

2. `batch/internal/pipeline/group_test.go` を新規作成

最低限入れるべきテスト:

- 同一カテゴリなら merge される
- 異カテゴリなら merge されない
- `other` と既知カテゴリは merge されない
- unknown 同士は高閾値を超えた場合のみ merge される
- embedding なし記事は引き続き単独クラスタになる

### できれば同時にやる変更

3. `batch/internal/config` 周辺

もし config 化するなら:

- `UnknownCategoryClusterThresholdOffset float64`

もしくは:

- `UnknownCategoryClusterThreshold float64`

ただし第1段階では必須ではない。

4. `batch/README.md`

- grouping 仕様に「カテゴリ一致が必須」を追記
- `other` は例外レーン扱いであることを明記

## 実装詳細

### 推奨実装形

`GroupArticles` のシグネチャは最小変更に留める。

現状:

```go
func GroupArticles(articles []db.Article, threshold float64) []Cluster
```

推奨:

```go
func GroupArticles(articles []db.Article, threshold float64) []Cluster
```

中で補助関数を追加するだけでよい。

### 推奨ロジック

```go
func GroupArticles(articles []db.Article, threshold float64) []Cluster {
    var clusters []Cluster

    for _, a := range articles {
        if len(a.Embedding) == 0 {
            clusters = append(clusters, Cluster{
                Articles: []db.Article{a},
                DomCat:   normalizedCategoryOrOther(a.Category),
            })
            continue
        }

        articleCat := normalizedCategory(a.Category)
        articleUnknown := isUnknownCategory(articleCat)

        localThreshold := threshold
        if articleUnknown {
            localThreshold = threshold + 0.05
        }

        bestIdx, bestSim := -1, localThreshold
        for i, c := range clusters {
            if len(c.Centroid) == 0 {
                continue
            }
            if !canJoinCluster(articleCat, c.DomCat) {
                continue
            }
            sim := float64(cosineSim(a.Embedding, c.Centroid))
            if sim > bestSim {
                bestIdx, bestSim = i, sim
            }
        }

        if bestIdx >= 0 {
            clusters[bestIdx].Articles = append(clusters[bestIdx].Articles, a)
            clusters[bestIdx].Centroid = meanVec(articleVecs(clusters[bestIdx].Articles))
            clusters[bestIdx].DomCat = dominantCat(clusters[bestIdx].Articles)
        } else {
            clusters = append(clusters, Cluster{
                Centroid: a.Embedding,
                Articles: []db.Article{a},
                DomCat:   articleCat,
            })
        }
    }

    return clusters
}
```

補足:

- `dominantCat` は空文字を返さず、unknown は `"other"` に正規化して返す方が安全
- `DomCat` が cluster metadata として不安定だと後続判定がぶれるため

### `dominantCat` の期待仕様

推奨:

- 空文字は `"other"` に寄せる
- 戻り値は `""` ではなく正規化済みカテゴリにする

例:

```go
func dominantCat(articles []db.Article) string {
    counts := make(map[string]int)
    for _, a := range articles {
        cat := normalizedCategory(a.Category)
        if cat == "" {
            cat = "other"
        }
        counts[cat]++
    }
    best, bestN := "other", 0
    for cat, n := range counts {
        if n > bestN {
            best, bestN = cat, n
        }
    }
    return best
}
```

## 受け入れ条件

### 機能条件

- `politics` と `economy` など、既知カテゴリが異なる記事は同一 cluster にならない
- `other` 記事が既知カテゴリ cluster に吸い込まれない
- embedding なし記事は従来通り単独 cluster
- cluster 数が増えても naming/store まで pipeline が正常完走する

### 品質条件

- `group_test.go` でカテゴリ制約のユニットテストが追加されている
- 新規 snapshot で `cross_category_mismatch` の件数が目視でも減る
- 既存の snapshot 保存フォーマットは壊さない

## テストケース

### Case 1: 同一カテゴリ merge

- article A: `politics`, vec = X
- article B: `politics`, vec = X に近い
- 期待: 1 cluster

### Case 2: 異カテゴリ split

- article A: `politics`, vec = X
- article B: `economy`, vec = X にかなり近い
- 期待: 2 clusters

### Case 3: `other` と既知カテゴリ split

- article A: `other`, vec = X
- article B: `politics`, vec = X にかなり近い
- 期待: 2 clusters

### Case 4: unknown 同士 merge

- article A: `other`, vec = X
- article B: `other`, vec = X に非常に近い
- 期待: unknown 専用閾値を超えるなら 1 cluster

### Case 5: embedding なし

- article A: embedding なし
- article B: `politics`, vec あり
- 期待: article A は単独 cluster

## リスク

### 1. 過分割

分類ミスがあると、本来同一イベントでも分かれる。

対策:

- 第2段階で Go 側分類を taxonomy / subcategory 対応に寄せる
- inspect で「近いのに別カテゴリで分かれた」ケースをあとで再分析できるようにする

### 2. `other` が増えすぎる

分類精度が低い期間は unknown レーンに記事がたまりやすい。

対策:

- unknown は高閾値
- 将来的には `other` を単独クラスタ優先にさらに寄せてもよい

### 3. 既存 snapshot との差分が大きく見える

group 数が増え、タイトルも変わりやすい。

対策:

- これは期待された変化として扱う
- 比較時は `cross_category_mismatch` の減少を主指標にする

## 段階導入案

### Step 1

カテゴリ hard gate のみ導入する。

- 既知カテゴリ同士は一致必須
- `other` / 空文字は unknown
- unknown と既知カテゴリは merge 禁止
- unknown 同士のみ高閾値で許可

### Step 2

Go 分類の強化。

- `subcategory` を実用レベルで付与する
- taxonomy を Next.js と揃える

### Step 3

必要なら subcategory 制約を追加する。

ただしこれは分類品質が安定してからでよい。

## 5.3x 実装指示として十分な粒度のタスク分解

### タスク 1

`batch/internal/pipeline/group.go` を修正し、異カテゴリ penalty を削除して hard gate に置き換える。

完了条件:

- `canJoinCluster` 相当の関数が追加されている
- 異カテゴリクラスタが similarity 比較対象から外れている

### タスク 2

unknown category の定義を `""` と `"other"` に統一する。

完了条件:

- grouping 内のカテゴリ判定が正規化関数経由になっている
- `dominantCat` も同じ定義を使っている

### タスク 3

unknown 同士の専用閾値を導入する。

完了条件:

- known category より厳しい閾値で unknown cluster merge を判定している

### タスク 4

`batch/internal/pipeline/group_test.go` を追加し、カテゴリ制約の挙動を固定する。

完了条件:

- 少なくとも 5 ケースのユニットテストがある
- `go test` で対象パッケージが通る

### タスク 5

`batch/README.md` に grouping 仕様の更新を反映する。

完了条件:

- 「同一カテゴリのみでクラスタリング」
- 「unknown category は例外レーン」

の2点が明記されている

## 実装後の確認方法

1. バッチを1回流す
2. `/inspect` で新 snapshot を確認する
3. `cross_category_mismatch` 件数を旧 snapshot と比較する
4. 分割されすぎた group がどの程度増えたかを目視確認する

## 今回やらないこと

- subcategory 一致まで必須にする変更
- LLM / embedding ベースの高精度分類への全面移行
- inspect 再計算 API の実装
- snapshot schema 変更

## 推奨判断

この変更は入れてよい。

理由:

- 現状の UI/inspect の期待仕様とも整合する
- 実装コストが低い
- 問題の主症状である「異ニュース混入」をすぐ下げられる
- 将来の taxonomy / subcategory 強化とも矛盾しない
