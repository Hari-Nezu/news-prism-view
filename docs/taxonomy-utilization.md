# 3層分類体系の活用

## 現状

taxonomy の活用は **一部実装済み**。  
現在効いているのは主に次の2点。

1. グループ化時のカテゴリ減衰
2. 点検UIでのカテゴリ混在検出

---

## 実装済みの活用

### 1. グループ化時のカテゴリ減衰

Go バッチの [group.go](/Users/mk/Development/NewsPrismView/news-prism-view/backend/internal/pipeline/group.go) では、異カテゴリ間のマッチに 0.7 倍のペナルティを掛けている。

```go
if a.Category != "" && a.Category != "other" &&
	c.DomCat != "other" && a.Category != c.DomCat {
	sim *= 0.7
}
```

これはハードフィルタではなくソフトフィルタ。

### 2. グループへの category / subcategory 保存

snapshot 側には:

- `SnapshotGroup.category`
- `SnapshotGroup.subcategory`
- `SnapshotGroupItem.category`
- `SnapshotGroupItem.subcategory`

が保存される。

### 3. 点検UIでの利用

[/inspect](/Users/mk/Development/NewsPrismView/news-prism-view/src/app/inspect/page.tsx) と [db.ts](/Users/mk/Development/NewsPrismView/news-prism-view/src/lib/db.ts#L517) では、カテゴリ混在やサブカテゴリ混在の警告に使っている。

---

## まだ未実装

### 1. 命名プロンプトへのカテゴリ文脈注入

文書上の案はあるが、現状の Go バッチ命名ロジックに taxonomy 文脈を明示的に渡しているわけではない。

### 2. カテゴリ別スタンス集計API

未実装。

まだ無いもの:

- `/api/bias/stance`
- `source × category` 集計
- 媒体傾向のカテゴリ別マップ

### 3. カバレッジマトリクスのカテゴリ絞り込み

未実装。

`CoverageMatrix` は現状、カテゴリフィルタなしで全グループを扱う。

---

## 現在の結論

- taxonomy はすでにただのメタデータではなく、グループ化と点検で使っている
- ただし活用はまだ限定的
- 今後伸ばしやすいのは、命名、カテゴリ別集計、UI フィルタ
