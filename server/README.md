# newsprism-server

Next.js フロントエンドと batch サーバーの間に立つ API サーバー。記事分析（LLM）、RSS/YouTube フィード取得、比較分析、バッチ結果参照、履歴・類似検索を提供する。

---

## 起動

```bash
go run ./cmd/newsprism-server
```

デフォルトポート: `8091`（`API_PORT` で変更可）

---

## 環境変数

| 変数 | デフォルト | 説明 |
|------|-----------|------|
| `DATABASE_URL` | `postgresql://newsprism:newsprism@localhost:5432/newsprism` | PostgreSQL接続先 |
| `LLM_BASE_URL` | `http://127.0.0.1:8081` | チャットモデル用 OpenAI互換サーバー |
| `EMBED_BASE_URL` | `http://127.0.0.1:8081` | 埋め込みモデル用サーバー |
| `LLM_MODEL` | `gemma-4-E4B-it-Q8_0` | 分析用チャットモデル |
| `CLASSIFY_MODEL` | `gemma-4-E4B-it-Q8_0` | 分類用チャットモデル |
| `EMBED_MODEL` | `Targoyle/ruri-v3-310m-GGUF:Q8_0` | 埋め込みモデル |
| `API_PORT` | `8091` | サーバーポート |
| `BATCH_SERVER_URL` | `http://127.0.0.1:8090` | batch サーバーのURL |
| `FEEDS_YAML_PATH` | `feeds.yaml` | フィード定義ファイルパス |

---

## API エンドポイント

### 分析

| メソッド | パス | 説明 |
|---------|------|------|
| `POST` | `/api/analyze` | 記事のポジショニング分析（3軸スコア + 要約 + 反論）。SSE マルチモデル対応 |
| `POST` | `/api/classify` | 記事のカテゴリ分類（LLM） |
| `POST` | `/api/fetch-article` | URL から記事本文をスクレイピング |

### RSS / YouTube

| メソッド | パス | 説明 |
|---------|------|------|
| `GET` | `/api/rss?feedUrl=` | RSS フィードを取得・パース |
| `GET` | `/api/youtube/feed?channels=` | YouTube チャンネルの動画一覧取得 |
| `POST` | `/api/youtube/analyze` | YouTube 動画の一括分析（SSE） |

### 比較

| メソッド | パス | 説明 |
|---------|------|------|
| `GET` | `/api/compare?keyword=` | キーワードで RSS 検索 → LLM でグルーピング |
| `POST` | `/api/compare/analyze` | グループ内記事の一括分析（SSE） |

### バッチ結果

| メソッド | パス | 説明 |
|---------|------|------|
| `GET` | `/api/batch/latest` | 最新スナップショット + グループ一覧 |
| `GET` | `/api/batch/history` | スナップショット履歴 |
| `POST` | `/api/batch/run` | batch サーバーへパイプライン実行を中継 |
| `GET` | `/api/batch/inspect?groupId=` | グループ詳細（記事一覧 + メタデータ） |
| `POST` | `/api/batch/inspect/recompute` | グループの類似度再計算 |

### 履歴・類似検索

| メソッド | パス | 説明 |
|---------|------|------|
| `GET` | `/api/history` | 分析済み記事の履歴 |
| `POST` | `/api/history/similar` | embedding ベクトルで類似記事検索 |

### その他

| メソッド | パス | 説明 |
|---------|------|------|
| `GET` | `/api/config` | フロントエンド用設定 |
| `GET` | `/api/feed-groups` | フィードグループ一覧 |

---

## 内部パッケージ

| パッケージ | 役割 |
|-----------|------|
| `handler` | HTTP ハンドラ。`Deps` に全依存を集約 |
| `analyzer` | LLM に 3軸ポジショニング分析を依頼、JSON パース |
| `classifier` | LLM にカテゴリ分類を依頼、taxonomy でバリデーション |
| `grouper` | 記事リストを LLM + embedding で類似イベントにグルーピング |
| `scraper` | URL から記事本文を抽出（goquery） |
| `rss` | RSS フィードのパース・キーワードフィルタ |
| `youtube` | YouTube チャンネルフィード取得 |
| `sse` | SSE レスポンスライター |
| `middleware` | CORS |

---

## テスト

```bash
cd server && GOCACHE=../.gocache go test ./...
```

テスト計画の詳細: [`TEST_PLAN.md`](TEST_PLAN.md)
