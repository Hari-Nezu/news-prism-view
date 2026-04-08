# グルーピング点検・修正 運用設計

## 背景

バッチで生成されたニュースグループが、なぜその構成になったのかを調査し、必要に応じて修正する仕組みが必要。点検はスナップショット単位で、特定グループの記事構成を詳細に診断する流れを設計。

---

## 問題構造（3層）

| 層 | 原因 | 例 | 対応 |
|:--|:--|:--|:--|
| **Embedding** | ベクトル化が不正確 | 「石破首相が訪米」と「石破首相が記者会見」の意味的距離が近すぎる | モデル/プリセット改善（長期） |
| **Clustering** | 閾値or greedy順序の問題 | 本来別トピックだがコサイン類似度が閾値を超えて合流 | 閾値調整・シミュレーション |
| **Naming** | グループ自体は正しいが名前が悪い | 実態と合わないタイトルが付く | 採用グループタイトルの修正 |

UI上の直感「このグループにこの記事が入っているのはおかしい」から、データ診断を通じて原因層を特定し対応を判断する。

---

## 診断API: `GET /api/batch/inspect?snapshotId=<id>&groupId=<id>`

### リクエスト
```bash
GET /api/batch/inspect?snapshotId=abc123&groupId=xyz789
```

### レスポンス
```json
{
  "snapshotId": "abc123",
  "groupId": "xyz789",
  "groupTitle": "石破首相の外交動向",
  "dominantCategory": "politics",
  "threshold": 0.87,
  "articles": [
    {
      "url": "https://nhk.jp/...",
      "title": "石破首相が訪米、バイデン大統領と会談",
      "source": "NHK",
      "category": "politics",
      "published_at": "2026-04-08T10:30:00Z",
      "similarity_to_centroid": 0.951,
      "cross_category_penalty_applied": false,
      "similarity_before_penalty": 0.951,
      "similarity_after_penalty": 0.951,
      "nearest_neighbors": [
        {
          "url": "https://asahi.jp/...",
          "title": "首相訪米の狙いは半導体供給網強化",
          "similarity": 0.923
        },
        {
          "url": "https://yomiuri.jp/...",
          "title": "日米首脳会談、経済安保でも協調",
          "similarity": 0.918
        }
      ]
    },
    {
      "url": "https://asahi.jp/...",
      "title": "石破首相、記者会見で経済対策に言及",
      "source": "朝日新聞",
      "category": "economy",
      "published_at": "2026-04-08T11:45:00Z",
      "similarity_to_centroid": 0.874,
      "cross_category_penalty_applied": true,
      "similarity_before_penalty": 0.874,
      "similarity_after_penalty": 0.612,
      "penalty_reason": "カテゴリ不一致（economy ≠ politics）",
      "nearest_neighbors": [
        {
          "url": "https://nikkei.jp/...",
          "title": "政府の経済対策、6月に策定へ",
          "similarity": 0.856
        }
      ],
      "alternative_clusters": [
        {
          "groupId": "alt001",
          "groupTitle": "政府の経済対策",
          "similarity_to_that_centroid": 0.821,
          "reason": "economic カテゴリ一致、経済対策テーマ"
        },
        {
          "groupId": "alt002",
          "groupTitle": "首相の政策声明",
          "similarity_to_that_centroid": 0.798
        }
      ]
    }
  ],
  "summary": {
    "total_articles": 2,
    "by_category": { "politics": 1, "economy": 1 },
    "similarity_range": { "min": 0.612, "max": 0.951, "mean": 0.8825 },
    "issues": [
      {
        "type": "cross_category_mismatch",
        "article_url": "https://asahi.jp/...",
        "severity": "medium",
        "message": "economy カテゴリの記事が政治グループに混入（ペナルティ適用後 0.612 で境界ぎりぎり）"
      }
    ]
  }
}
```

### ポイント
- **similarity_to_centroid**: グループ重心との類似度 → 低いほど「ギリギリ混入」
- **cross_category_penalty_applied**: カテゴリ不一致による0.7ペナルティが適用されたか
- **nearest_neighbors**: グループ内で最も近い記事 → 「何に引きずられて入ったか」の理由
- **alternative_clusters**: 他グループとの類似度 → 「本来ここに入るべきだった」候補
- **summary.issues**: 自動検出された問題（カテゴリミスマッチ、外れ値など）

---

## 修正アクション API

### 1. 記事をグループから除外
```bash
POST /api/batch/inspect/exclude
Content-Type: application/json

{
  "snapshotId": "abc123",
  "articleUrl": "https://asahi.jp/...",
  "groupId": "xyz789",
  "reason": "カテゴリが異なり経済対策グループに入るべき"
}
```

**効果**: スナップショット内のグループから記事を削除。他グループへの移動はしない（orphan状態）

### 2. 記事を別グループに移動
```bash
POST /api/batch/inspect/move
Content-Type: application/json

{
  "snapshotId": "abc123",
  "articleUrl": "https://asahi.jp/...",
  "fromGroupId": "xyz789",
  "toGroupId": "alt001",
  "reason": "経済カテゴリマッチのため移動"
}
```

**効果**: スナップショット内で記事をグループ間で移動

### 3. 閾値シミュレーション（dry run）
```bash
POST /api/batch/inspect/simulate-threshold
Content-Type: application/json

{
  "snapshotId": "abc123",
  "threshold": 0.90
}
```

**レスポンス例**:
```json
{
  "original": {
    "threshold": 0.87,
    "group_count": 15,
    "groups": [
      {
        "groupId": "xyz789",
        "groupTitle": "石破首相の外交動向",
        "article_count": 2
      }
    ]
  },
  "simulated": {
    "threshold": 0.90,
    "group_count": 16,
    "groups": [
      {
        "groupId": "xyz789",
        "groupTitle": "石破首相の外交動向",
        "article_count": 1,
        "removed_articles": ["https://asahi.jp/..."]
      },
      {
        "groupId": "new_001",
        "groupTitle": "石破首相の経済発言",
        "article_count": 1,
        "articles": ["https://asahi.jp/..."]
      }
    ]
  },
  "impact": {
    "new_groups": 1,
    "merged_groups": 0,
    "regrouped_articles": 1
  }
}
```

**効果**: 閾値を変えたらグルーピングがどう変わるかを表示（実際には反映しない）

### 4. フィードバック記録
```bash
POST /api/batch/inspect/feedback
Content-Type: application/json

{
  "snapshotId": "abc123",
  "articleUrl": "https://asahi.jp/...",
  "groupId": "xyz789",
  "action": "should_not_be_here",
  "confidence": 0.9,
  "reason": "カテゴリ economy なのに politics グループ"
}
```

**効果**: 将来の閾値チューニングや モデルの学習用フィードバック記録

---

## 点検UI: `/inspect/[snapshotId]/[groupId]`

```
┌─────────────────────────────────────────────────────────────┐
│ 点検: 石破首相の外交動向         [スナップショット選択] [×] │
├─────────────────────────────────────────────────────────────┤
│ 閾値: 0.87  カテゴリ: politics   記事数: 2 / 合計メディア: 2 │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│ 記事一覧（類似度 降順）                                        │
│ ┌───────────────────────────────────────────────────────┐    │
│ │ ●●● 0.951                                   [詳細]   │    │
│ │ ⬤ NHK  石破首相が訪米、バイデン大統領と会談        │    │
│ │ 2026-04-08 10:30 | politics                          │    │
│ │ センテンス内類似: ⚫⚫⚫⚫⚪ (4/5)                    │    │
│ │ 判定: ✅ 正常  [除外] [移動]                          │    │
│ ├───────────────────────────────────────────────────────┤    │
│ │ ●●● 0.874  ⚠️ カテゴリ警告                    [詳細] │    │
│ │ ⬤ 朝日 石破首相、会見で経済対策に言及               │    │
│ │ 2026-04-08 11:45 | economy ← politics と不一致       │    │
│ │ ペナルティ適用: 0.874 × 0.7 = 0.612 (ギリギリ)      │    │
│ │ 近い記事: 「政府の経済対策」グループ (0.821)        │    │
│ │ 判定: ⚠️  要検討  [除外] [移動→経済対策]             │    │
│ └───────────────────────────────────────────────────────┘    │
│                                                               │
│ 統計                                                          │
│ 類似度分布: ████████░░ (0.612 ～ 0.951 | μ=0.883)           │
│ カテゴリ分布: politics(50%) economy(50%) ⚠ 混在              │
│ 問題検出: ⚠️ 1件 (カテゴリ不一致)                            │
│                                                               │
│ [アクション]                                                  │
│ ┌──────────────────────────────────┐                         │
│ │ 閾値シミュレーション              │                         │
│ │ 現在: 0.87                        │                         │
│ │ ┌──●────────────┐                │                         │
│ │ 0.80          0.95              │                         │
│ │ → 0.90に変更: グループ15→16 (+1分割) │                    │
│ │                                  │                         │
│ │ [フィードバック送信] [スナップショット適用] │               │
│ └──────────────────────────────────┘                         │
└─────────────────────────────────────────────────────────────┘
```

### 表示要素
1. **記事カード**: 類似度, 警告フラグ, アクション
2. **統計**: 類似度ヒストグラム, カテゴリ分布, 自動検出された問題
3. **シミュレーション**: 閾値スライダーで再グルーピング結果を即座に表示
4. **アクション**: 除外/移動/フィードバック送信

---

## 実装フェーズ

| Phase | 内容 | 工数 | 依存関係 |
|:--|:--|:--|:--|
| **P0** | スナップショットに `similarity` を保存（スキーマ変更） | 小 | なし |
| **P1** | 診断API（Goバッチ側） | 小 | P0 |
| **P2** | 点検UI（フロント） | 中 | P1 |
| **P3** | 除外/移動アクション（スナップショット書き換え） | 小 | P2 |
| **P4** | 閾値シミュレーション（dry run再グルーピング） | 中 | P1 |
| **P5** | フィードバック記録・自動チューニング（長期） | 大 | P4 |

### P0: スキーマ変更
`SnapshotGroupItem` に以下カラムを追加:
```sql
ALTER TABLE "SnapshotGroupItem" ADD COLUMN "similarity" FLOAT;
ALTER TABLE "SnapshotGroupItem" ADD COLUMN "category_mismatch" BOOLEAN;
ALTER TABLE "SnapshotGroupItem" ADD COLUMN "similarity_before_penalty" FLOAT;
```

バッチ側: `store.go` で `SnapshotGroupItem` を保存する際に、各記事の類似度をDBに記録

---

## 運用フロー

1. **ランキングページで「あれ？」と気づく**
   → 該当グループをクリック → `/inspect/[snapshotId]/[groupId]`

2. **診断ページで詳細確認**
   → 類似度, カテゴリ警告, 代替グループ候補を閲覧
   → 問題が明らか → アクション選択

3. **修正実行**
   - 除外: 記事削除
   - 移動: 別グループへ
   - 閾値調整: シミュレーション確認後、フィードバック記録 → 次回バッチ時に適用

4. **フィードバック蓄積**
   → 閾値の自動チューニング、またはモデル改善の根拠へ

---

## 技術的留意点

### グループ重心（Centroid）の保存 vs リアルタイム計算
- **事前保存**: 点検はスナップショット完結。ただしスキーマ拡張必要
- **リアルタイム計算**: 記事embeddingが必要（3日で期限切れ）

→ **推奨: 事前保存**。スナップショットの自己完結性と安定性を優先

### 閾値シミュレーション
診断API呼び出し時にリアルタイムで `GroupArticles` を再実行し、異なる閾値でのグルーピング結果をシミュレート。実際には反映しない（dry run）。

### フィードバックとしての記録
`exclude / move` アクションと別に、単純に「この記事はこのグループにいるべきではない」というマーク。将来的に機械学習や統計的に閾値を最適化する時の学習データに。

