# Public / Private 分離設計

## 目的

サイト公開にあたり、LLM分析・RSS収集などの内部処理と、結果表示の公開部分を分離する。

## 現状の構成

```
[ブラウザ] → [Next.js (API + UI)] → [PostgreSQL + pgvector]
                   ↓                         ↑
              [Ollama/LLM]           [Go Batch Pipeline]
```

全機能が同一Next.jsアプリに同居しており、LLMサーバーが必須。

---

## 分離後の構成

```
                    ┌─────────────────────────────────┐
                    │         Private Network          │
                    │                                  │
                    │  [Internal Next.js]  [Go Batch]  │
                    │       ↓       ↑         ↓       │
                    │    [Ollama]  [PostgreSQL]         │
                    │              (primary)            │
                    └────────────┬─────────────────────┘
                                 │ read replica /
                                 │ logical replication
                                 ▼
┌──────────┐     ┌──────────────────────────────┐
│ ブラウザ  │ ──→ │  Public Next.js (Vercel等)    │
└──────────┘     │  → PostgreSQL (read replica)  │
                 └──────────────────────────────┘
```

### 2つのアプリケーション

| | Public App | Internal App |
|---|---|---|
| 役割 | 結果の閲覧 | データ収集・分析 |
| デプロイ先 | Vercel / Cloudflare | 自宅サーバー / VPS |
| DB接続 | **読み取り専用** | 読み書き |
| LLM依存 | なし | 必須 |
| 公開 | インターネット | VPN / ローカルのみ |

---

## Public App — 公開する機能

### ページ

| パス | 内容 | データソース |
|---|---|---|
| `/` | ランディング — 最新のカバレッジマトリクス | `ProcessedSnapshot` + `SnapshotGroup` |
| `/ranking` | カバレッジマトリクス（履歴付き） | 同上 |
| `/topic/[groupId]` | グループ詳細 — 記事一覧・メディア分布 | `SnapshotGroup` + `SnapshotGroupItem` |
| `/about` | サイト説明・3軸スコアの解説 | 静的 |

### API Routes (読み取り専用)

| エンドポイント | 用途 |
|---|---|
| `GET /api/snapshots/latest` | 最新スナップショット + グループ一覧 |
| `GET /api/snapshots/[id]` | 特定スナップショットの詳細 |
| `GET /api/snapshots/history` | スナップショット履歴 |

### 特徴

- **LLM不要** — 分析済みデータの表示のみ
- **DB読み取り専用** — read replicaまたはread-only接続文字列
- **ISR (Incremental Static Regeneration)** — スナップショットは1時間更新なのでrevalidate=3600で十分
- **Edge対応** — 軽量なのでEdge Runtimeで動作可能

---

## Internal App — 非公開にする機能

### 残す機能

| 機能 | 関連API | 理由 |
|---|---|---|
| 個別記事分析 | `POST /api/analyze` | LLM必須・管理者用 |
| RSS取得 | `POST /api/rss` | フィード設定は内部操作 |
| メディア比較 | `/compare` + API | LLMでリアルタイム分析 |
| YouTube分析 | `/youtube` + API | LLM必須 |
| バッチ実行トリガー | `POST /api/batch/run` | Go Pipelineの制御 |
| 検査ページ | `/inspect` | デバッグ用 |
| Go Batch Pipeline | `:8090` | 全パイプライン処理 |

### 追加すべき機能

| 機能 | 目的 |
|---|---|
| 認証（Basic Auth or OAuth） | 管理者のみアクセス |
| Batch実行ダッシュボード | パイプラインの状態監視 |

---

## DB分離戦略

### 推奨: PostgreSQL Logical Replication

```
[Primary DB] ──logical replication──→ [Read Replica]
 (Internal)                            (Public)
```

**公開DBに複製するテーブル（読み取り専用で十分なもの）:**

| テーブル | 理由 |
|---|---|
| `ProcessedSnapshot` | ランキング表示 |
| `SnapshotGroup` | グループ一覧 |
| `SnapshotGroupItem` | グループ内記事 |

**複製しないテーブル（内部専用）:**

| テーブル | 理由 |
|---|---|
| `Article` | 個別分析結果（管理者用） |
| `RssArticle` | 生RSS（embedding含む） |
| `FeedGroup` / `FeedGroupItem` | インクリメンタルグループ（内部処理用） |
| `CompareSession` / `CompareResult` / `CompareGroupRecord` | 比較セッション（管理者用） |
| `YouTubeVideo` | YouTube分析（管理者用） |

### 代替案: 同一DBの読み取り専用ユーザー

小規模運用であれば、replicaを立てずにread-onlyのDBユーザーで十分。

```sql
CREATE ROLE public_reader WITH LOGIN PASSWORD '***';
GRANT CONNECT ON DATABASE newsprism TO public_reader;
GRANT USAGE ON SCHEMA public TO public_reader;
GRANT SELECT ON processed_snapshot, snapshot_group, snapshot_group_item TO public_reader;
```

---

## 実装ステップ

### Phase 1: モノレポ内でアプリ分割

```
news-prism-view/
├── apps/
│   ├── public/          # 公開用Next.js
│   │   ├── src/
│   │   │   ├── app/     # /, /ranking, /topic/[id], /about
│   │   │   └── lib/     # DB読み取りのみ
│   │   └── package.json
│   └── internal/        # 内部用Next.js（現在のsrc/を移動）
│       ├── src/
│       └── package.json
├── packages/
│   └── shared/          # 共有型定義・UIコンポーネント
│       ├── types/       # SnapshotGroup等の型
│       └── ui/          # 共通UIコンポーネント
├── backend/             # Go Batch（変更なし）
├── prisma/              # スキーマ（変更なし）
└── package.json         # Turborepo/pnpm workspace root
```

### Phase 2: Public App 実装

1. `apps/public` にNext.jsプロジェクト作成
2. スナップショット関連のDB読み取りロジックを移植
3. ISRでランキングページを実装
4. `/about` ページで3軸スコアの解説を作成

### Phase 3: デプロイ分離

1. Public App → Vercel (or Cloudflare Pages)
   - 環境変数: `DATABASE_URL`（read-only接続文字列）
   - Build: `turbo run build --filter=public`
2. Internal App → 既存サーバー（Docker Compose継続）
   - LLM/DB/Batchはすべてプライベートネットワーク内
3. DB: read-onlyユーザー or read replica設定

### Phase 4: ドメイン設定

```
newsprism.example.com       → Public App (Vercel)
admin.newsprism.example.com → Internal App (VPN経由)
```

---

## セキュリティ考慮事項

| 項目 | 対策 |
|---|---|
| Public DBアクセス | SELECT権限のみ・対象テーブル限定 |
| Internal App露出防止 | VPN / Tailscale / IP制限 |
| API Rate Limit | Public APIにVercel Edge Middleware等でrate limit |
| DB接続文字列 | 環境変数で管理、Vercel Secrets使用 |
| CORS | Public Appのオリジンのみ許可 |

---

## 将来の拡張

- **Public Appでの比較機能**: 事前分析済みの比較結果を公開テーブルに追加すれば、LLMなしで過去の比較を閲覧可能
- **Webhook通知**: バッチ完了時にPublic AppのISRをon-demand revalidate
- **CDN最適化**: スナップショットJSONをR2/S3に静的配置し、DBアクセスを完全に排除
