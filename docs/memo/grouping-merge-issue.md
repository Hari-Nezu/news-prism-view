# グルーピング：別グループへの合流問題

## 現象

同一トピックの記事がgreedy clusteringの処理順序に依存して別グループに分かれてしまう。

### 具体例（2026-04-14確認）

読売新聞「習氏 友好ムード演出 台湾野党主席と会談」が単独グループに入り、
同トピックの以下3記事（別グループ）に合流しなかった。

| 類似度 | メディア | タイトル |
|:--|:--|:--|
| 0.906 | テレビ朝日 | 中国共産党・習近平総書記 台湾最大野党・国民党の鄭麗文主席と北京で会談 |
| 0.903 | テレビ朝日 | 台湾野党主席 10年ぶり中国本土訪問「戦争避けられない運命ない」 |
| 0.896 | 東京新聞 | 台湾・国民党の鄭麗文主席が中国に到着 |

centroid類似度: 0.9021（十分高い）

## 原因候補

1. **処理順序依存**: greedy clusteringは記事の処理順で結果が変わる。読売記事が先に別クラスタに入り、後から3記事クラスタが形成された可能性
2. **カテゴリ不一致ペナルティ**: politics vs international など異カテゴリの場合、+0.08 の閾値オフセットで合流が阻まれる（`crossCategoryThresholdOffset = 0.08`）

## 対応方法の候補

### A. クラスタ間マージパス（推奨）

`GroupArticles` の後にクラスタ同士のcentroid類似度を比較し、閾値以上なら統合する2nd passを追加。処理順序依存を解消できる。

```go
// GroupArticles 後に実行
for i := 0; i < len(clusters); i++ {
    for j := i + 1; j < len(clusters); j++ {
        sim := cosineSimilarity(clusters[i].Centroid, clusters[j].Centroid)
        if sim > mergeThreshold && compatibleCategory(clusters[i], clusters[j]) {
            // clusters[i] に clusters[j] を統合
            clusters[i].Articles = append(clusters[i].Articles, clusters[j].Articles...)
            clusters[i].Centroid = meanVector(articleVectors(clusters[i].Articles))
            clusters[i].DomCate = dominantCate(clusters[i].Articles)
            clusters = append(clusters[:j], clusters[j+1:]...)
            j--
        }
    }
}
```

### B. crossCategoryThresholdOffset を下げる

カテゴリ不一致が原因の場合、`0.08` → `0.05` に下げることで合流しやすくなる。ただし誤合流のリスクも増加。

### C. 記事の再割当てパス

クラスタリング後に各記事について「自クラスタのcentroid類似度 vs 他クラスタのcentroid類似度」を比較し、より適切なクラスタがあれば移動する。

## 備考

- `/inspect` の再計算診断（recompute）で `nearestNeighbors` と `alternativeClusters` を確認して原因切り分けが可能
- カテゴリ不一致が原因かどうかは、該当記事のカテゴリを確認する必要がある
