# 報道ポイント別カバレッジ表示

## 目的

ランキング画面のトピック詳細オーバーレイを「媒体別の記事カード」から「報道ポイント（事実）× 媒体」形式に変更する。
各事実をどのメディアが報じているかを一覧し、全体一致・部分一致・独自報道を視覚的に区別できるようにする。

## データ構造

Go バッチの `consensus` ステージで生成済み。`snapshot_groups.consensus_points` に JSONB で格納。

```json
[
  {"fact": "日銀が政策金利を0.5%に引き上げた", "sources": ["NHK", "読売新聞", "朝日新聞"]},
  {"fact": "利上げは2007年以来最大幅",          "sources": ["日本経済新聞"]},
  {"fact": "円安是正への効果を疑問視する声も",    "sources": ["朝日新聞", "毎日新聞"]}
]
```

ポイントは `sources` 数の降順（バックエンドでソート済み）。

## UI 設計

### オーバーレイ内レイアウト

```
┌─ トピック名 ─────────────── 報道姿勢を比較 ✕ ─┐
│                                                │
│  3/3  日銀が政策金利を0.5%に引き上げた          │
│       [N NHK] [朝 朝日新聞] [読 読売新聞]      │
│                                                │
│  2/3  円安是正への効果を疑問視する声も           │
│       [朝 朝日新聞] [毎 毎日新聞]               │
│                                                │
│  1/3  利上げは2007年以来最大幅                   │
│       [経 日本経済新聞]                          │
│                                                │
│  ▶ 元記事を表示（5件）                          │
└────────────────────────────────────────────────┘
```

### カバー数バッジの色分け

| 条件 | 色 | 意味 |
|---|---|---|
| `sources.length === totalSources` | emerald | 全一致 |
| `sources.length > totalSources / 2` | sky | 過半数 |
| `sources.length > 1` | amber | 少数 |
| `sources.length === 1` | gray | 単独 |

`totalSources` = グループ内のユニーク媒体数。

### 媒体 pill

- `MEDIA` 配列の `match()` で短縮名を取得
- `getSourceColors()` でブランドカラーを inline style で適用
- 形式: ドット + ラベル（`● 朝日新聞`）

### フォールバック

`consensusPoints` が空/null（シングルトン、単一媒体、旧データ）の場合は従来の媒体別記事カードをそのまま表示。

### 元記事へのアクセス

`<details>` による折りたたみセクション。展開すると既存の媒体別記事カードを表示。

## 変更対象ファイル

| ファイル | 変更 |
|---|---|
| `src/types/index.ts` | `ConsensusPoint` 型、`NewsGroup.consensusPoints` 追加 |
| `src/components/ConsensusPointsView.tsx` | 新規: ポイント一覧 + 折りたたみ記事 |
| `src/components/CoverageMatrix.tsx` | オーバーレイ内で条件分岐 |
| `e2e/fixtures/data.ts` | grp-001 にテスト用 consensusPoints 追加 |
| `e2e/ranking.spec.ts` | ポイント表示 + フォールバックのテスト追加 |

## 利用する既存ユーティリティ

- `getSourceColors()` — `src/lib/source-colors.ts`
- `MEDIA` — `src/lib/media-matcher.ts`
- `groupItemsBySource()` — `src/lib/group-items-by-source.ts`
- `formatRelative()` — `src/lib/format-time.ts`
