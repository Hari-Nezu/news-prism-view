# まとめ画面の機能メモ

## 現状

まとめ画面で **実装済み** なのは主に次の2つ。

1. 最新 snapshot の表示
2. 報道カバレッジマトリクス

一方で、以前検討していた以下はまだ未実装。

- グループごとの3軸ミニチャート
- 合意事実 / 相違点の抽出
- snapshot 保存時の追加 LLM スコアリング

---

## 実装済み

### 1. ランキング画面

[ranking/page.tsx](/Users/mk/Development/NewsPrismView/news-prism-view/src/app/ranking/page.tsx)

現在の役割:

- `GET /api/batch/latest` で snapshot 読み込み
- `POST /api/batch/run` でバッチ起動
- `CoverageMatrix` 表示

### 2. カバレッジマトリクス

[CoverageMatrix.tsx](/Users/mk/Development/NewsPrismView/news-prism-view/src/components/CoverageMatrix.tsx)

できること:

- 多媒体グループのみ表示
- 媒体列を動的に表示
- 行クリックで記事一覧オーバーレイ

### 3. snapshot データ

現在 snapshot に保存されているのは主に次。

- `groupTitle`
- `category`
- `subcategory`
- `coveredBy`
- `silentMedia`
- `items[]`

これだけで、カバレッジ表示や簡易点検は成立している。

---

## 未実装

### 1. トピック軸比較

未実装。

まだ無いもの:

- `SnapshotGroupItem.economic`
- `SnapshotGroupItem.social`
- `SnapshotGroupItem.diplomatic`
- `SnapshotGroupItem.confidence`
- ミニ軸チャート UI

### 2. 合意事実の抽出

未実装。

まだ無いもの:

- `SnapshotGroup.consensusFacts`
- `SnapshotGroup.divergences`
- snapshot 保存時の consensus ステージ

### 3. summary 用追加バッチステージ

未実装。

現在の Go バッチは:

```text
collect → embed → classify → group → name → store
```

`score` や `consensus` は入っていない。

---

## 既存機能との関係

詳細な論調比較そのものは `/compare` 側にある。  
まとめ画面は現状、「一覧とカバレッジの可視化」が主役。

---

## 現在の結論

- まとめ画面は snapshot 読み取り中心
- カバレッジマトリクスは実装済み
- 3軸比較や合意事実抽出は今後の拡張案
