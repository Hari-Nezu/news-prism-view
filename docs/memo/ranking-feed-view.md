## ランキング型グループ表示 — 【DONE】

記事数（媒体数）に応じてカードサイズを変え、ニュースのボリューム感を一目で伝える。

`RankingHeroCard`, `RankingMediumCard`, `RankingCompactItem` 等が実装済み。

### コンポーネント構成

```
src/components/
├── RankingFeedView.tsx        # コンテナ：ソート + ティア振り分け
├── RankingHeroCard.tsx        # #1 ヒーローカード
├── RankingMediumCard.tsx      # #2-3 ミディアムカード
└── RankingCompactItem.tsx     # #4以降 コンパクト1行
```

### groupMode の3値化

```ts
type GroupMode = "off" | "flat" | "ranking";
```

RssFeedPanel の既存 `groupMode: boolean` を置き換え。デフォルトの「まとめ表示」は ranking モードに。

### ティア定義

| ティア | 対象 | レイアウト |
|---|---|---|
| Hero | ソート後 #1 | 全幅、text-lg、カバレッジバー（報道媒体数/全媒体数）、ソースバッジ大 |
| Medium | #2-3 | 2カラムgrid、text-base、ソースバッジ通常サイズ |
| Compact | #4以降 | 1行リスト、text-sm、バッジ2つ+残り件数 |
| Muted | singleOutlet | Compactと同じ + opacity-50、末尾にセクション区切り |

### ソートロジック

1. singleOutlet を末尾
2. ユニーク媒体数 降順
3. 記事数 降順

### Hero カード特有要素

- カバレッジバー: `(ユニーク媒体数 / totalSourceCount) * 100` のプログレスバー
- amber系カラー（border-amber-200, bg-gradient-to-br from-amber-50）
- ランクメダル絵文字

### アニメーション

- 展開/折りたたみ: CSS grid-template-rows トリック（0fr ↔ 1fr）
- 初回表示: staggered fade-in（各カード80msずつ遅延）
- Hero: scale bounce 演出

### Props

```ts
interface RankingFeedViewProps {
  groups: NewsGroup[];
  totalSourceCount: number;  // カバレッジバー用
  analyzedUrls: string[];
  analyzingUrl?: string;
  onAnalyze: (item: RssFeedItem) => void;
  onCompareArticle?: (item: RssFeedItem) => void;
}
```

### 実装順序

1. types/index.ts — GroupMode 型追加
2. globals.css — 展開アニメーションCSS
3. RankingCompactItem.tsx（最シンプル）
4. RankingMediumCard.tsx
5. RankingHeroCard.tsx（カバレッジバー含む）
6. RankingFeedView.tsx（ソート + 振り分け + 組み立て）
7. RssFeedPanel.tsx — groupMode 3値化 + 分岐追加
