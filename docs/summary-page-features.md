# まとめ画面の3機能拡張設計

## 概要

ランキング画面（まとめ）に以下3つの機能を追加する：

1. **報道カバレッジマトリクス** - 各メディアがどのトピックをカバーしたかを可視化
2. **トピック軸比較** - グループごとに経済・社会・外交軸のスコアを表示
3. **合意事実の抽出** - 複数メディアが共通して報じている事実と相違点を表示

---

## 全体のデータフロー

### 現在のパイプライン（Go バッチ）

```
collect → embed → classify → group → name → store
```

### 拡張後のパイプライン

```
collect → embed → classify → group → name → score → consensus → store
                                              ^^^^    ^^^^^^^^^
                                              新規      新規
```

---

## 機能1: 報道カバレッジマトリクス

### 特徴

- **処理:** 追加なし（既存データで完結）
- **コスト:** 0（バッチ追加なし、UI のみ）
- **実装難度:** 低

### データソース

`SnapshotGroup.coveredBy[]` と各 `SnapshotGroupItem.source` は既にバッチで保存済み。

### UI 設計

15 大手メディアの頭文字（N朝毎読経産東時共TテレフジNTV洋ハ）を行に、トピックを列にしたマトリクス表示。

```
         N  朝  毎  読  経  産  東  時  共  T  テ  日  フ  洋  ハ
トピック1  ●  ●  ●  ●  ●  ●  ○  ○  ●  ●  ●  ●  ○  ○  ○
トピック2  ●  ●  ○  ●  ○  ○  ○  ●  ●  ○  ○  ○  ○  ○  ○
トピック3  ○  ●  ●  ○  ●  ○  ○  ○  ○  ○  ○  ○  ○  ●  ●
```

- **セル:** グループに含まれる記事数に応じた塗り分け（0=空白、1=薄色、2+=濃色）
- **インタラクション:** 行クリック → そのグループに画面スクロール
- **媒体マッピング:** 名称 → 頭文字 1-2 文字への変換

### 実装場所

- **新規コンポーネント:** `src/components/CoverageMatrix.tsx`
- **導入先:** ランキングページ上部、ファーストビューに配置
- **データ:** 既存の `groups: NewsGroup[]` を集計（`items[].source` でカウント）

### 実装ステップ

1. `CoverageMatrix.tsx` 作成
   - 15 媒体の ID → 頭文字マッピングテーブル
   - Grid レイアウト（CSS Grid）
   - セル色：記事数 0/1/2+ で 3 段階
2. 媒体ソート順の確認（`coveredBy[]` の順序保証）
3. ランキングページに埋め込み

---

## 機能2: トピック軸比較

### 特徴

- **処理:** バッチ（Go）で軽量スコアリング + オンデマンドで詳細分析
- **コスト:** バッチ ~12s 追加、オンデマンド既存フロー再利用
- **実装難度:** 中

### 問題点

現在の `SnapshotGroupItem` には 3 軸スコアがない。スコアリングには LLM 推論が必要。

### 2 段階アプローチ

| 段階 | タイミング | 入力 | コスト | 精度 |
|---|---|---|---|---|
| 軽量スコア | バッチ（Go） | title + summary | ~1s/記事 | 方向性レベル |
| 詳細分析 | オンデマンド | 記事全文(HTML) | ~3-5s/記事 | 高精度 |

### バッチ側処理

**新ステージ追加:** `pipeline/score.go` - name の後、store の前に実行

```go
// score.go の概要:
// - 各クラスタの記事を title + summary でスコアリング
// - LLM プロンプト: 既存の SYSTEM_PROMPT を summary 入力に最適化
// - クラスタごと 1 回の LLM 呼び出しで全記事をバッチスコア
// - 並列処理: 最大 5 グループ同時
```

**LLM コスト見積もり:**

```
~30 グループ × 平均 5 記事 = ~150 記事
バッチ化: 1 グループ全記事を 1 回の LLM 呼び出し → ~30 回
~2s/call × 30 = ~60s（5 並列なら ~12s）
```

### DB スキーマ変更

```prisma
model SnapshotGroupItem {
  // 既存フィールド...
  id          String
  groupId     String
  title       String
  url         String
  source      String
  summary     String?
  publishedAt String?
  category    String?
  subcategory String?

  // 新規: 3 軸スコア
  economic    Float?    // -1.0 ~ +1.0
  social      Float?    // -1.0 ~ +1.0
  diplomatic  Float?    // -1.0 ~ +1.0
  confidence  Float?    // 0.0 ~ 1.0
}
```

### UI 設計

グループ展開セクション内に**ミニスコアバー**を表示:

```
┌──────────────────────────────────────────────┐
│ [1] トランプ関税と円安                   ▼   │
├──────────────────────────────────────────────┤
│ 経済  朝●──────NHK●────毎●──           ←保守 革新→
│ 社会  NHK●─────朝●──毎●────            ←伝統 多様性→
│ 外交  毎●────NHK●──────朝●──           ←タカ派 ハト派→
│                                    [詳細比較]│
├──────────────────────────────────────────────┤
│ ● NHK (2件)  │ ● 朝日 (1件) │ ● 毎日 (1件)│
│ ...           │ ...          │ ...          │
└──────────────────────────────────────────────┘
```

- 3 本の横バー（経済・社会・外交）
- 各媒体の平均スコアをドットで表示
- スコア `null` の場合は該当セクション非表示
- 「詳細比較」ボタンで compare ページへ遷移（または既存フロー利用）

### 実装場所

**バッチ側（Go）:**
- `backend/internal/pipeline/score.go` 新規作成
- `backend/internal/pipeline/pipeline.go` - stage 追加
- `backend/internal/pipeline/store.go` - スコアの DB 保存処理を追加

**フロント側（Next.js）:**
- `src/components/AxisMiniChart.tsx` 新規作成
- `src/components/RankingHeroCard.tsx` / `RankingMediumCard.tsx` / `RankingCompactItem.tsx` - ミニチャート組み込み
- `src/app/ranking/page.tsx` 既存ロジック利用（score が null なら表示しない）

### 実装ステップ

1. Prisma schema 更新 & migration 作成
2. `score.go` 実装（5 並列処理）
3. `store.go` 変更（score データベース保存）
4. `AxisMiniChart.tsx` 実装（D3 or CSS Grid）
5. 各カードコンポーネントに組み込み
6. バッチパイプラインテスト

### オンデマンド詳細分析

既存の `/api/compare/analyze` フローを再利用。
ユーザーが「詳細比較」をクリック → compare ページへ遷移、または同ページ内モーダルで `MediaComparisonView` を表示。

---

## 機能3: 合意事実の抽出

### 特徴

- **処理:** バッチ（Go）のみ
- **コスト:** バッチ ~6s 追加
- **実装難度:** 低～中

### 理由

各グループの summary は既にバッチで収集済み。1 グループ 1 回の LLM 呼び出しで抽出可能。リアルタイム処理の必要なし。

### バッチ側処理

**新ステージ追加:** `pipeline/consensus.go` - score の後、store の前に実行

```go
// consensus.go の概要:
// - 各クラスタについて、2 社以上が報じている記事の summary を集約
// - LLM に送信して共通事実と相違点を抽出
// - singleOutlet グループはスキップ
// - 並列処理: 最大 5 グループ同時
```

### LLM プロンプト

```
以下は同じニュースイベントについて複数のメディアが報じた要約です。

[NHK] タイトル: ... / 要約: ...
[朝日] タイトル: ... / 要約: ...

以下のJSON形式のみで回答:
{
  "facts": ["2社以上が共通して報じている客観的事実（箇条書き）"],
  "divergences": ["各社で異なる点や独自の視点"]
}
```

**LLM コスト見積もり:**

```
singleOutlet でない ~15 グループ
1 LLM call/グループ × ~2s = ~30s（5 並列なら ~6s）
```

### DB スキーマ変更

```prisma
model SnapshotGroup {
  // 既存フィールド...
  id           String
  snapshotId   String
  groupTitle   String
  category     String?
  subcategory  String?
  rank         Int
  singleOutlet Boolean
  coveredBy    Json?           // string[]
  silentMedia  Json?           // string[]

  // 新規: 合意事実と相違点
  consensusFacts Json?  // string[] - 共通事実
  divergences    Json?  // string[] - 各社の違い

  items SnapshotGroupItem[]
}
```

### UI 設計

グループカードのヘッダ直下（展開不要で常時表示）:

```
┌──────────────────────────────────────────────┐
│ [1] トランプ関税と円安                   ▼   │
│                                              │
│  📌 共通事実                                  │
│   ・トランプ大統領が中国に25%の追加関税を発表  │
│   ・日経平均が800円超の下落                    │
│   ・円相場が一時1ドル=148円台に               │
│                                              │
│  💬 各社の違い                                │
│   ・朝日: 国内企業への影響を強調              │
│   ・産経: 安全保障の観点から支持的な論調      │
├──────────────────────────────────────────────┤
```

### 実装場所

**バッチ側（Go）:**
- `backend/internal/pipeline/consensus.go` 新規作成
- `backend/internal/pipeline/pipeline.go` - stage 追加
- `backend/internal/pipeline/store.go` - consensus データ DB 保存処理を追加

**フロント側（Next.js）:**
- `src/components/ConsensusFacts.tsx` 新規作成
- `src/components/RankingHeroCard.tsx` / `RankingMediumCard.tsx` - ConsensusFacts 組み込み
- `src/types/index.ts` - NewsGroup interface に consensusFacts/divergences フィールド追加

### 実装ステップ

1. Prisma schema 更新 & migration 作成
2. `consensus.go` 実装（5 並列処理）
3. `store.go` 変更（consensus データ DB 保存）
4. `ConsensusFacts.tsx` 実装（レイアウト）
5. 各カードコンポーネントに組み込み
6. バッチパイプラインテスト

---

## パイプライン全体のコスト影響

| ステージ | 現在 | 追加 | 備考 |
|---|---|---|---|
| collect | ~10s | 0 | |
| embed | ~20s | 0 | |
| classify | ~5s | 0 | |
| group | ~5s | 0 | |
| name | ~15s | 0 | |
| **score** | - | **~12s** | 5 並列、30 グループ |
| **consensus** | - | **~6s** | 5 並列、15 グループ |
| store | ~2s | 0 | |
| **合計** | ~57s | **~18s** | 合計 ~75s/回 |

毎時実行に十分収まる。Go バッチサーバーの負荷：許容範囲。

---

## 実装フェーズ

### Phase A: カバレッジマトリクス

**優先度:** 高（バッチ変更なし）

**変更内容:**
- `src/components/CoverageMatrix.tsx` 新規作成
- ランキングページに埋め込み
- 既存データのみで完結

**実装期間:** 2-3 時間

### Phase B: 合意事実抽出

**優先度:** 中（バッチ変更ありだが比較的簡単）

**変更内容:**
- `prisma/migrations/` - SnapshotGroup に consensusFacts/divergences 追加
- `backend/internal/pipeline/consensus.go` 新規
- `backend/internal/pipeline/pipeline.go` - stage 追加
- `backend/internal/pipeline/store.go` - DB 保存処理追加
- `src/components/ConsensusFacts.tsx` 新規
- 各カードコンポーネントに組み込み

**実装期間:** 4-5 時間

### Phase C: トピック軸比較

**優先度:** 中（機能豊富だがスコアベース）

**変更内容:**
- `prisma/migrations/` - SnapshotGroupItem に 3 軸スコア追加
- `backend/internal/pipeline/score.go` 新規
- `backend/internal/pipeline/pipeline.go` - stage 追加
- `backend/internal/pipeline/store.go` - DB 保存処理追加
- `src/components/AxisMiniChart.tsx` 新規
- 各カードコンポーネントに組み込み

**実装期間:** 5-6 時間

---

## 推奨実装順序

1. **Phase A** - UI のみで即実装可能。ユーザー価値大。
2. **Phase B** - バッチ追加はシンプル。価値と実装難度のバランスが良い。
3. **Phase C** - より複雑だが、Phase B の上に乗せやすい。

---

## 注意事項

### singleOutlet グループ

- **カバレッジマトリクス:** 1 媒体だけの欄は 1 行になる（OK）
- **軸比較:** 1 社のスコアしかないため、比較価値が低い。UI では目立たせない（オプション表示）
- **合意事実:** 複数社がないため、「相違点」が抽出できない。スキップ（OK）

### スコア精度

LLM が title + summary だけで判断するため、詳細分析（HTML 全文）より精度は落ちる。
UI では「軽量スコア」の旨を明記、詳細比較へのリンクを提供。

### キャッシュ戦略

- `consensusFacts` / `divergences` / `score` は snapshot 内に永続化
- 履歴参照時も同じ値を使用（スナップショット時点での分析結果）
- 再分析は新しいバッチ実行のみ

---

## ファイル変更一覧

### Phase A（UI のみ）

```
src/components/CoverageMatrix.tsx ...................... 新規
src/app/ranking/page.tsx .............................. 組み込み
```

### Phase B（バッチ + UI）

```
prisma/schema.prisma ................................... SnapshotGroup フィールド追加
prisma/migrations/[timestamp]_consensus_facts/ ......... 新規
backend/internal/pipeline/consensus.go ................ 新規
backend/internal/pipeline/pipeline.go ................. stage 追加
backend/internal/pipeline/store.go .................... DB 保存処理追加
src/components/ConsensusFacts.tsx ..................... 新規
src/components/RankingHeroCard.tsx .................... 組み込み
src/components/RankingMediumCard.tsx .................. 組み込み
```

### Phase C（バッチ + UI）

```
prisma/schema.prisma ................................... SnapshotGroupItem フィールド追加
prisma/migrations/[timestamp]_group_item_scores/ ...... 新規
backend/internal/pipeline/score.go .................... 新規
backend/internal/pipeline/pipeline.go ................. stage 追加
backend/internal/pipeline/store.go .................... DB 保存処理追加
src/components/AxisMiniChart.tsx ...................... 新規
src/components/RankingHeroCard.tsx .................... 組み込み
src/components/RankingMediumCard.tsx .................. 組み込み
src/types/index.ts .................................... (NewsGroup に score フィールド追加の可能性)
```

---

## 検証方法

### Phase A

1. ランキングページを開く
2. マトリクスが表示される
3. 媒体ごとのカバレッジが正しく反映されている
4. 行クリックでスクロール動作

### Phase B

1. 新しいバッチを実行
2. `SnapshotGroup.consensusFacts / divergences` に値が入っている
3. UI に共通事実と相違点が表示される
4. singleOutlet グループは該当セクション非表示

### Phase C

1. 新しいバッチを実行
2. `SnapshotGroupItem.[economic|social|diplomatic|confidence]` に値が入っている
3. UI にミニスコアバーが表示される
4. 「詳細比較」で compare ページへ遷移可能
