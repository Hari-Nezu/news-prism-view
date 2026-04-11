# まとめ画面 拡張設計

## 未実装機能

まとめ画面へ今後追加を目指す追加実装機能。

### 1. トピック軸比較

まだ無いもの:
- `SnapshotGroupItem.economic`
- `SnapshotGroupItem.social`
- `SnapshotGroupItem.diplomatic`
- `SnapshotGroupItem.confidence`
- ミニ軸チャート UI

### 2. 合意事実の抽出

まだ無いもの:
- `SnapshotGroup.consensusFacts`
- `SnapshotGroup.divergences`
- snapshot 保存時の consensus ステージ

### 3. summary 用追加バッチステージ

現在の Go バッチは `collect → embed → classify → group → name → store` となっている。
`score` や `consensus` といった追加の要約用ステージをパイプラインに組み込む設計。

## 既存機能との関係

詳細な論調比較そのものは `/compare` 側にある。
まとめ画面は現状、「一覧とカバレッジの可視化」が主役となっており、今後はミニチャートを通じた俯瞰を可能にする。
