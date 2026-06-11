---
status: current
scope: feature:inspect
authoritative: true
last_verified: 2026-06-11
verified_against: main@f57460c
---

# inspect 再グルーピング（regroup）仕様

スナップショット上で「グループに混ざった記事」を、運用者が個別に別グループへ移動・単独グループ化できる機能。
[`grouping-inspection.md`](./grouping-inspection.md) の点検・再計算診断に続く**手動補正**の手段であり、[`../design/grouping-inspection-feedback.md`](../design/grouping-inspection-feedback.md) が構想した override の一形態にあたる（ただし `grouping_params` 方式とは別物）。

## エンドポイント（Go server `server/internal/handler/batch.go`）

### `POST /api/batch/inspect/regroup/suggest`

LLM に「この記事はどのグループへ移すべきか」を判定させ、候補を返す（DB は変更しない）。

リクエスト:

```json
{ "snapshotId": "...", "groupId": "...", "articleUrl": "https://..." }
```

処理:

1. `GetSnapshotGroupDetail(groupID)` で対象記事がグループ内に存在するか検証（無ければ 404）
2. `GetCandidateGroupsForRegroup(snapshotId, excludeGroupID=groupId)` で同一スナップショット内の他グループを候補取得
3. 候補グループ群と対象記事タイトルを LLM に渡し、移動先を判定

レスポンス:

```json
{
  "articleUrl": "...",
  "fromGroupId": "...",
  "targetGroupId": "..." ,      // null なら単独グループ化を推奨
  "targetGroupTitle": "...",
  "reason": "..."
}
```

### `POST /api/batch/inspect/regroup/apply`

判定結果（または運用者の指定）に従って実際に記事を移動する。

リクエスト:

```json
{ "snapshotId": "...", "groupId": "...", "articleUrl": "...", "targetGroupId": "..." }
```

- `targetGroupId` が非 null/空 → `MoveArticleToGroup(articleURL, fromGroupID, toGroupID)`。レスポンス `{"ok":true,"action":"moved","targetGroupId":...}`
- `targetGroupId` が null/空 → `CreateSoloGroupAndMoveArticle(...)` で対象記事を単独グループへ分離。レスポンス `{"ok":true,"action":"solo","newGroupId":...}`

## 関連 DB 関数（`shared/db/snapshots.go`）

- `GetCandidateGroupsForRegroup` — 移動先候補（`RegroupCandidate`）一覧
- `MoveArticleToGroup` — 既存グループへ移動
- `CreateSoloGroupAndMoveArticle` — 単独グループを作成して移動

## UI

`src/app/(internal)/inspect/page.tsx` の snapshot タブから suggest → apply を呼ぶ（`fetch(\`${API_BASE}/api/batch/inspect/regroup/suggest|apply\`)`）。

## 注意・今後の課題

- 本機能はスナップショット上のグループ構成を**直接書き換える**（点検 recompute の「不変なスナップショット上のシミュレーション」とは性質が異なる）。
- フィードバックを次回バッチへ反映する仕組み（`grouping_params`）とは未接続。両者の関係整理は [`../design/grouping-inspection-feedback.md`](../design/grouping-inspection-feedback.md) の課題。
