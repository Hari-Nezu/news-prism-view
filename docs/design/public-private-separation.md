# Public / Private 分離設計

## 方針

単一コードベースから **2つの独立したデプロイ** を生成する。

- **Public**: 公開URL。`/ranking` のみ提供
- **Private**: 関係者のみ知るURLにデプロイ。全ページ提供。認証なし

認証ではなく **デプロイ先の分離** で保護する。

```text
[一般ユーザー]
   ↓
[Public デプロイ]          ← DEPLOY_MODE=public
   └─ /ranking のみ
        ↓
   [API サーバー]
        ↓
   [PostgreSQL]

[関係者]
   ↓
[Private デプロイ]         ← DEPLOY_MODE 未設定
   ├─ /
   ├─ /ranking
   ├─ /compare
   ├─ /youtube
   └─ /inspect
        ↓
   [API サーバー] ← [Go Batch]
        ↓
   [PostgreSQL]
```

---

## ルート分類

### Public（公開）

| ルート | 役割 | API 依存 |
|:--|:--|:--|
| `/ranking` | バッチ結果・スナップショット表示 | `GET /api/batch/latest` |

snapshot の読み取りで完結。LLM 不要。

public ビルドでは以下の UI 要素を非表示にする:

- internal ページへのリンク（`/`, `/compare`）
- `OllamaStatus` コンポーネント
- バッチ実行ボタン

### Private（関係者限定）

| ルート | 役割 |
|:--|:--|
| `/` | 記事URL入力 → LLM 多軸スコアリング |
| `/ranking` | バッチ結果表示（バッチ実行ボタンあり） |
| `/compare` | 同一ニュースの媒体比較分析（LLM） |
| `/youtube` | YouTube 字幕分析（LLM） |
| `/inspect` | DB・スナップショット診断 / 再計算 |

---

## ファイル構成

```
src/
├── middleware.ts             # DEPLOY_MODE による route 制御
├── lib/
│   └── deploy-mode.ts       # IS_PUBLIC 定数（クライアント用）
└── app/
    ├── layout.tsx
    ├── globals.css
    ├── (public)/
    │   └── ranking/
    │       └── page.tsx      # → /ranking
    └── (internal)/
        ├── page.tsx          # → /
        ├── compare/
        │   └── page.tsx      # → /compare
        ├── youtube/
        │   └── page.tsx      # → /youtube
        └── inspect/
            └── page.tsx      # → /inspect
```

route group はURLに影響しない。

---

## 環境変数

### ビルド時（`NEXT_PUBLIC_*`）

| 変数 | 値 | 用途 |
|:--|:--|:--|
| `NEXT_PUBLIC_DEPLOY_MODE` | `public` or 未設定 | クライアント側 UI 分岐 |
| `NEXT_PUBLIC_API_URL` | API サーバーURL | API エンドポイント |

### ランタイム（サーバー側）

| 変数 | 値 | 用途 |
|:--|:--|:--|
| `DEPLOY_MODE` | `public` or 未設定 | middleware でのルート制御 |

### 設定例

**Public ビルド:**

```env
NEXT_PUBLIC_DEPLOY_MODE=public
NEXT_PUBLIC_API_URL=https://api.example.com
DEPLOY_MODE=public
```

**Private ビルド:**

```env
NEXT_PUBLIC_API_URL=http://localhost:8091
```

---

## ルート制御（middleware）

```
リクエスト
  ↓
DEPLOY_MODE=public ?
  ├─ YES → /ranking ? → 通過 / それ以外 → 404
  └─ NO  → 全ルート通過
```

---

## ビルド・デプロイ

### Docker

```dockerfile
ARG NEXT_PUBLIC_DEPLOY_MODE=
ENV NEXT_PUBLIC_DEPLOY_MODE=$NEXT_PUBLIC_DEPLOY_MODE
```

```bash
# Public
docker build --build-arg NEXT_PUBLIC_DEPLOY_MODE=public \
             --build-arg NEXT_PUBLIC_API_URL=https://api.example.com \
             -t newsprism-public .

# Private
docker build --build-arg NEXT_PUBLIC_API_URL=http://api-server:8091 \
             -t newsprism-private .
```

---

## 将来の検討事項（未実装）

### API サーバー側の制御

Public 向け API サーバーでは書き込み系エンドポイントを無効化する案:

- `POST /api/batch/run` → 拒否
- `POST /api/analyze` → 拒否
- `GET /api/batch/latest` → 許可

### DB 分離

#### 案A: read replica

public API は snapshot 系テーブルのみ参照する replica を使用。

#### 案B: read-only user（小規模向け）

```sql
CREATE ROLE public_reader WITH LOGIN PASSWORD '***';
GRANT CONNECT ON DATABASE newsprism TO public_reader;
GRANT USAGE ON SCHEMA public TO public_reader;
GRANT SELECT ON processed_snapshots, snapshot_groups, snapshot_group_items TO public_reader;
```

現時点では Next.js が DB に直接アクセスしていないため、API サーバー側で制御すれば足りる。
