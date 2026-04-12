# 3層分類体系（Taxonomy）の活用 仕様

## 実装済みの活用

### 1. グループ化時のカテゴリ・ハードゲート

Go バッチの `batch/internal/pipeline/steps/group.go` では、分類された `category` が一致しない記事同士がグループとしてマージされることをハードゲートで防ぐロジックが実装されている。これにより見当違いのカテゴリが混合することを防ぐ。

### 2. グループへの category / subcategory 保存

スナップショット側には以下のメタデータが保存される。

- `SnapshotGroup.category`
- `SnapshotGroup.subcategory`
- `SnapshotGroupItem.category`
- `SnapshotGroupItem.subcategory`

### 3. 点検UIでの利用

`src/app/inspect/page.tsx` と `src/lib/db.ts` では、カテゴリ混在やサブカテゴリ混在の警告・イシュー表示に使っている。
