# バッチパイプライン設計

## 背景・動機

現状は全処理（RSS取得 → embedding → LLMグループ命名 → 分類）がリクエスト時にオンデマンド実行される。

**問題点:**
- ページ表示のたびに15社RSS取得 + embedding + LLM呼び出しが走る（数十秒〜数分）
- 同じ記事を何度も再処理する無駄
- LLM/embeddingサーバーの負荷が閲覧数に比例
- ユーザー体験: 待ち時間が長い

**目指す姿:**
- 定時バッチで収集・処理を完了し、DBに結果を格納
- UIはDBから読むだけ → 即時表示

---

## パイプライン概要

```
[cron: 毎時] → collect → embed → classify → group → name → store
                 ↓                                        ↓
              RssArticle                            ProcessedSnapshot
                                                   ├─ SnapshotGroup
                                                   └─ SnapshotGroupItem
```

### ステージ

| # | ステージ | 処理内容 | 依存 | 推定時間 |
|---|---------|---------|------|---------|
| 1 | **collect** | 15社+デフォルトフィードのRSS取得、RssArticle upsert | なし | ~30s |
| 2 | **embed** | 新規記事（embedding未計算）のバッチembedding | llama.cpp | ~20s/100件 |
| 3 | **classify** | 新規記事のtopic/subcategory分類 | llama.cpp | ~30s/100件 |
| 4 | **group** | embedding類似度によるグリーディクラスタリング | embed完了 | ~5s |
| 5 | **name** | LLMによるグループ命名 | group完了 | ~10s |
| 6 | **store** | スナップショットとしてDBに保存 | name完了 | ~2s |

合計: 1回あたり約2分（記事100件想定）

---

## DBスキーマ変更

### RssArticle 拡張

```prisma
model RssArticle {
  // ... 既存フィールド ...

  // バッチ処理で付与
  embedding    Unsupported("vector(1024)")?
  classifiedAt DateTime?   // classify済みフラグ
  embeddedAt   DateTime?   // embed済みフラグ
}
```

現在のRssArticleにはembeddingがない。バッチでembeddingを計算し格納することで、グループ化時の再計算を不要にする。

### 新テーブル: ProcessedSnapshot

バッチ実行ごとの「スナップショット」を保存。UIはこれを読む。

```prisma
/// バッチ処理の実行記録 + 結果スナップショット
model ProcessedSnapshot {
  id          String   @id @default(cuid())
  processedAt DateTime @default(now())
  articleCount Int             // 処理対象記事数
  groupCount   Int             // 生成グループ数
  durationMs   Int             // パイプライン実行時間
  status       String          // "success" | "partial" | "failed"
  error        String?

  groups      SnapshotGroup[]

  @@index([processedAt(sort: Desc)])
}

/// スナップショット内のニュースグループ
model SnapshotGroup {
  id           String   @id @default(cuid())
  snapshot     ProcessedSnapshot @relation(fields: [snapshotId], references: [id], onDelete: Cascade)
  snapshotId   String

  groupTitle   String
  topic        String
  rank         Int              // 表示順位
  singleOutlet Boolean
  coveredBy    Json             // string[] — 報じた媒体名
  silentMedia  Json             // string[] — 報じなかった媒体名

  items        SnapshotGroupItem[]

  @@index([snapshotId])
}

/// スナップショットグループ内の記事
model SnapshotGroupItem {
  id          String   @id @default(cuid())
  group       SnapshotGroup @relation(fields: [groupId], references: [id], onDelete: Cascade)
  groupId     String

  title       String
  url         String
  source      String
  summary     String?
  publishedAt String?
  topic       String?
  subcategory String?

  @@index([groupId])
}
```

---

## 実行トリガー

### 選択肢と推奨

| 方式 | メリット | デメリット |
|------|---------|----------|
| **システムcron + curl** | シンプル、確実 | サーバー外部に依存 |
| Next.js Route + 外部cron | Next.jsに閉じる | Vercel等PaaSならcron設定が必要 |
| node-cron (プロセス内) | 追加インフラ不要 | Next.js dev serverでは不安定 |

**推奨: Next.js API Route + システムcron（macOS launchd / Linux crontab）**

```
# crontab -e
0 * * * * curl -s http://localhost:3000/api/batch/run > /dev/null 2>&1
```

理由:
- ローカル開発環境（llama.cpp もローカル）前提
- API Route内にパイプラインロジックを置けばテスト・手動実行が容易
- プロセス外cronなのでNext.js再起動の影響を受けない

---

## API設計

### POST `/api/batch/run`

バッチパイプラインを実行する。排他制御あり（二重実行防止）。

```typescript
// リクエスト
POST /api/batch/run
Authorization: Bearer <BATCH_SECRET>  // 簡易認証（env変数）

// レスポンス
{
  snapshotId: string;
  articleCount: number;
  groupCount: number;
  durationMs: number;
  status: "success" | "partial" | "failed";
}
```

### GET `/api/batch/latest`

最新スナップショットを返す。UIのメインデータソース。

```typescript
// レスポンス
{
  snapshot: {
    id: string;
    processedAt: string;
    groups: SnapshotGroup[];  // items含む
  } | null;
}
```

### GET `/api/batch/history`

過去のスナップショット一覧（デバッグ・管理用）。

```typescript
// クエリパラメータ
?limit=10

// レスポンス
{
  snapshots: {
    id: string;
    processedAt: string;
    articleCount: number;
    groupCount: number;
    status: string;
  }[];
}
```

---

## パイプライン実装方針

```
src/lib/batch/
  pipeline.ts       — パイプラインオーケストレータ
  collect.ts        — RSS収集 + RssArticle upsert
  embed.ts          — 未embed記事のバッチembedding
  classify.ts       — 未classify記事の分類
  group.ts          — クラスタリング + 命名
  store.ts          — スナップショット保存
  lock.ts           — 排他制御（DBベース or ファイルロック）
```

### パイプライン疑似コード

```typescript
export async function runPipeline(): Promise<PipelineResult> {
  const lock = await acquireLock("batch-pipeline");
  if (!lock) throw new Error("別のバッチが実行中");

  const start = Date.now();
  try {
    // 1. 収集: 全フィードからRSS取得 → RssArticle upsert
    const collected = await collectFeeds();

    // 2. Embed: embeddedAt が null の記事をバッチembedding
    const embedded = await embedNewArticles();

    // 3. 分類: classifiedAt が null の記事を分類
    const classified = await classifyNewArticles();

    // 4. グループ化: 過去3日のembedding済み記事でクラスタリング
    const groups = await groupRecentArticles();

    // 5. 保存: スナップショットとしてDB保存
    const snapshot = await storeSnapshot(groups, {
      articleCount: collected.length,
      durationMs: Date.now() - start,
    });

    return { status: "success", snapshot };
  } finally {
    await releaseLock(lock);
  }
}
```

### 排他制御

DBテーブルで簡易ロック:

```prisma
model BatchLock {
  id        String   @id @default("singleton")
  lockedAt  DateTime
  expiresAt DateTime  // タイムアウト（10分）
}
```

`INSERT ... ON CONFLICT DO NOTHING` + `expiresAt` チェックで排他制御。
プロセスクラッシュ時も `expiresAt` 超過で自動解放。

---

## 既存処理との関係

### 移行戦略: 段階的

| フェーズ | 状態 |
|---------|------|
| **Phase A** | バッチ実行を追加。UIは従来通りオンデマンド（並行運用） |
| **Phase B** | UIのデフォルトデータソースを `GET /api/batch/latest` に切替 |
| **Phase C** | オンデマンドAPI（`/api/rss/group`）は手動更新ボタン用に残す |

### 変更しないもの

- `/api/analyze` — 個別記事の3軸分析は引き続きオンデマンド（ユーザーが選択した記事だけ分析）
- `/api/fetch-article` — 記事本文取得もオンデマンド
- `FeedGroup` / `FeedGroupItem` — 既存のインクリメンタルグループ化はバッチ内部で再利用可能

### 廃止候補

- `/api/bias/coverage` GET — バッチスナップショットに `coveredBy`/`silentMedia` が含まれるため不要に
- フロント側のRSS取得 → グループ化のオンデマンドフロー（Phase B以降）

---

## UIの変更

### メインフィード画面

```
現在: ページ表示 → /api/rss → /api/rss/group → 表示
変更: ページ表示 → /api/batch/latest → 表示（即時）
```

- `processedAt` を表示（「最終更新: 14:00」）
- 手動更新ボタン: `/api/batch/run` をPOST → 完了後にリロード
- スナップショットが存在しない場合のみ従来のオンデマンドフローにフォールバック

### バイアス分析画面

- `/api/batch/latest` のレスポンスに `coveredBy`/`silentMedia` が含まれるため、別APIなしでカバレッジマトリクスを描画可能

---

## スケジュール設定

### 推奨スケジュール

| 時間帯 | 頻度 | 理由 |
|--------|------|------|
| 6:00〜24:00 | 毎時 | ニュースが活発な時間帯 |
| 0:00〜5:00 | なし or 3時間毎 | 深夜は更新が少ない |

開発時は手動実行（UIボタン or curl）で十分。

### launchdの例（macOS）

```xml
<!-- ~/Library/LaunchAgents/com.newsprism.batch.plist -->
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.newsprism.batch</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/curl</string>
    <string>-s</string>
    <string>-X</string>
    <string>POST</string>
    <string>http://localhost:3000/api/batch/run</string>
  </array>
  <key>StartCalendarInterval</key>
  <array>
    <!-- 6:00〜23:00 の毎時0分 -->
    <dict><key>Hour</key><integer>6</integer><key>Minute</key><integer>0</integer></dict>
    <dict><key>Hour</key><integer>7</integer><key>Minute</key><integer>0</integer></dict>
    <!-- ... 省略 ... -->
    <dict><key>Hour</key><integer>23</integer><key>Minute</key><integer>0</integer></dict>
  </array>
</dict>
</plist>
```

---

## 注意事項

- **llama.cpp の起動前提**: embedding/LLMはローカルllama.cppサーバーに依存。バッチ実行時にサーバーが起動していなければ `status: "partial"` で記録（collectまでは成功）
- **スナップショットの保持期間**: 7日分を保持、それ以前はCASCADE削除
- **RssArticle embedding**: `Unsupported("vector(1024)")` なので生SQLで操作（既存パターンと同一）
- **初回実行**: スナップショットが空の場合、UIはフォールバックとしてオンデマンドフローを使用
