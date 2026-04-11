# まとめ画面 仕様

## 現状

まとめ画面で実装済み機能は主に次の2つ。

1. **最新 snapshot の表示**
   - `src/app/ranking/page.tsx`
   - `GET /api/batch/latest` で snapshot 読み込み
   - `POST /api/batch/run` でバッチ起動

2. **カバレッジマトリクス**
   - `src/components/CoverageMatrix.tsx`
   - 多媒体グループのみ表示
   - 媒体列を動的に表示
   - 行クリックで記事一覧オーバーレイ

## snapshot データ
現在 snapshot に保存されているのは主に次。

- `groupTitle`
- `category`
- `subcategory`
- `coveredBy`
- `silentMedia`
- `items[]`

これだけで、カバレッジ表示や簡易点検は成立している。
