# トピック変遷追跡機能（Topic Timeline）

## 背景・課題

現在のconsensusPointsは「ある時点のスナップショット」の合意点を表示するだけで、同じトピックが時間とともにどう変化したかを追えない。スナップショットごとにGroupIDが新規発行されるため、前回と今回の「同じニュース」の紐付けもない。

**解決すること**: 同一トピックのconsensusPointsの変遷を時系列で表示し、「いつ何がわかったか」を可視化する。

---

## データモデル変更

### `snapshot_groups` に `topic_thread_id` カラム追加

同一トピックを追跡するスレッドIDとして機能する。同じニュースイベントを報じたグループ群が同じIDを持つ。

```sql
-- batch/migrations/004_topic_thread_id.sql
ALTER TABLE snapshot_groups ADD COLUMN IF NOT EXISTS topic_thread_id TEXT;
CREATE INDEX IF NOT EXISTS idx_sg_topic_thread ON snapshot_groups (topic_thread_id)
  WHERE topic_thread_id IS NOT NULL;
```

Prisma schema (`prisma/schema.prisma`):
```prisma
model SnapshotGroup {
  // ...既存フィールド...
  topicThreadId  String?  @map("topic_thread_id")

  @@index([topicThreadId], map: "idx_sg_topic_thread")
}
```

新テーブルは不要。事実変遷はスナップショット間のconsensusPointsの差分として動的に計算する。

---

## バッチパイプライン変更（Go）

### トピックマッチング: 記事URL重複率（Jaccard係数）

Store関数（`batch/internal/pipeline/steps/store.go`）内で、保存前に直前スナップショットのグループとURL集合を取得し、Jaccard係数で同一トピック判定する。

```
Jaccard(A, B) = |A ∩ B| / |A ∪ B|
閾値: 0.3 以上 → 同一トピックとみなし、topic_thread_id を引き継ぐ
マッチなし → 新規UUID発行
```

**判定方式の選定理由**:
| 方式 | 評価 |
|---|---|
| タイトル類似度 | LLMがタイトルを変えうるため不安定 |
| Embedding類似度 | SnapshotGroupにembeddingカラムがない。centroid保存が必要 |
| **記事URL重複率** | 決定的・高速・確実。同じ記事が含まれれば同じトピック |

**マッチングアルゴリズム**:
- 貪欲法（最高スコアのペアから順に確定）
- 1対1マッチング。グループが分裂した場合は高スコア側が旧IDを引き継ぎ、他方は新規IDを発行
- グループ数は通常数十程度なのでO(n×m)で問題なし

### 変更ファイル

**`shared/db/snapshots.go`**:
- `SnapshotGroup` 構造体に `TopicThreadID string` 追加
- `GetPreviousSnapshotGroupURLs()` 追加 — 直前スナップショットの `{groupID, topicThreadID, articleURLs}` を取得
- `SaveSnapshot()` のINSERT文に `topic_thread_id` カラム追加
- `GetLatestSnapshotWithGroups()` のSELECTに `topic_thread_id` 追加
- `GetTopicTimeline()` 追加 — threadIDでフィルタし時系列で返す

**`batch/internal/pipeline/steps/store.go`**:
- `Store()` にJaccardマッチングロジックを追加
- `Store()` のシグネチャに `pool *db.Pool` を追加（直前スナップショット取得のため）

---

## APIエンドポイント追加

### `GET /api/batch/topic-timeline?threadId=xxx`

同一topic_thread_idを持つグループを時系列順で返す。

**レスポンス**:
```json
{
  "threadId": "xxx",
  "entries": [
    {
      "snapshotId": "...",
      "processedAt": "2026-04-20T10:00:00Z",
      "groupTitle": "日銀の利上げ決定",
      "consensusPoints": [
        {"fact": "日銀が政策金利を0.5%に引き上げた", "sources": ["NHK", "朝日新聞"]}
      ]
    },
    {
      "snapshotId": "...",
      "processedAt": "2026-04-20T06:00:00Z",
      "groupTitle": "日銀が利上げを検討",
      "consensusPoints": [...]
    }
  ]
}
```

**変更ファイル**:
- `server/internal/handler/batch.go` — `BatchTopicTimeline()` ハンドラ追加
- `server/internal/handler/register.go` — `GET /api/batch/topic-timeline` を登録

---

## フロントエンド

### 型定義 (`src/types/index.ts`)

```typescript
// NewsGroup に追加
topicThreadId?: string;

// 新型
interface TopicTimelineEntry {
  snapshotId: string;
  processedAt: string;
  groupTitle: string;
  consensusPoints: ConsensusPoint[];
}
```

### タイムラインUI (`src/components/ConsensusPointsView.tsx`)

`topicThreadId` が存在する場合、ヘッダーに「変遷」トグルボタンを追加。クリックで `/api/batch/topic-timeline` を呼び出し、縦タイムラインを展開。

**UIイメージ**:
```
┌──────────────────────────────────────┐
│ 日銀の利上げ決定            [変遷 ▼] │
├──────────────────────────────────────┤
│ ● 現在 (2時間前)                     │
│   3/5  日銀が政策金利を0.5%に...     │
│   3/5  植田総裁が記者会見で...  NEW  │
│   2/5  市場は年内の追加利上げ...     │
│                                      │
│ ● 8時間前                            │
│   3/5  日銀が政策金利の引き上げ...   │
│   2/5  市場は年内の追加利上げ...     │
│   1/5  一部報道で0.5%への...         │
└──────────────────────────────────────┘
```

**差分表示ロジック**:
- **NEWバッジ**: 1つ前のエントリに存在しなかったfactに付与（fact文字列の完全一致で判定）
- 前エントリにあったが消えたfactは表示しない（ノイズになるため）
- consensusPointsがない or topicThreadIdがないグループでは「変遷」ボタン非表示

---

## 実装順序

1. `batch/migrations/004_topic_thread_id.sql` — マイグレーション作成
2. `prisma/schema.prisma` — カラム追加 + `npx prisma generate`
3. `shared/db/snapshots.go` — 構造体変更、各関数追加・変更
4. `batch/internal/pipeline/steps/store.go` — Jaccardマッチング + `topic_thread_id` 付与
5. `server/internal/handler/batch.go` — `BatchTopicTimeline()` ハンドラ
6. `server/internal/handler/register.go` — ルート登録
7. `src/types/index.ts` — 型追加
8. `src/components/ConsensusPointsView.tsx` — タイムラインUI

---

## 制約・注意事項

- **既存データのbackfill不要**: 既存スナップショットのtopic_thread_idはNULL。タイムラインボタンはNULLのグループでは非表示のため問題なし
- **タイムラインの深さ**: スナップショット保持期間（7日）で自動制限される
- **Store関数のシグネチャ変更**: `pipeline.go` の呼び出し元も修正が必要
