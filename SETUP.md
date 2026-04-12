# セットアップガイド

## 前提条件

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Ollama](https://ollama.com/)（ローカル開発の場合）
- Node.js 20以上（ローカル開発の場合）

---

## 起動方法

### A. Docker だけで動かす（推奨）

Ollama・DB・アプリをすべてコンテナで起動します。初回はモデルのダウンロードに数分かかります。

```bash
docker compose up
```

ブラウザで http://localhost:3000 を開いてください。

---

### B. すでに Ollama を使っている場合

ホストで Ollama が起動済みであれば、こちらが起動が速いです。

```bash
# 事前に以下のモデルが pull されていること
ollama pull llama3.2
ollama pull ruri-v3-310m

docker compose -f docker-compose.local-ollama.yml up
```

---

### C. ローカル開発（コードを変更しながら使う）

```bash
# 1. DB と Ollama だけ Docker で起動
docker compose up db ollama ollama-init

# 2. Go API サーバー & バッチサーバーを起動（別々のターミナルで）
# Go API (Port 8091)
go run ./server/cmd/newsprism-server
# Go Batch (Port 8090)
go run ./batch/cmd/newsprism-batch serve

# 3. アプリをローカルで起動 (Port 3000)
cp .env.local.sample .env.local
npx prisma db push
npm run dev
```

---

## 環境変数

`.env.local.sample` をコピーして `.env.local` を作成してください。

```bash
cp .env.local.sample .env.local
```

### API / Backend

| 変数 | デフォルト | 説明 |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8091` | フロントエンドが参照する Go API サーバーの URL |
| `API_PORT` | `8091` | Go API サーバーの待受ポート |
| `BATCH_SERVER_URL` | `http://localhost:8090` | Go API が Batch 実行を依頼する際の URL |

### Ollama / モデル

| 変数 | デフォルト | 説明 |
|---|---|---|
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama サーバーの URL |
| `OLLAMA_MODEL` | `gemma3:12b` | 3軸政治分析に使う LLM |
| `CLASSIFY_MODEL` | `gemma3:4b` | ニュースカテゴリ分類に使う LLM |
| `EMBED_MODEL` | `mxbai-embed-large` | テキスト埋め込みモデル（出力次元 768） |
| `MULTI_MODELS` | `gemma3:12b,qwen3.5:4b,llama3.2` | マルチモデル分析モード用モデル一覧（カンマ区切り） |

### 類似度閾値

| 変数 | デフォルト | 説明 |
|---|---|---|
| `GROUP_CLUSTER_THRESHOLD` | `0.72` | バッチグループ化でのクラスタリング閾値（高いほど厳密） |
| `FEED_GROUP_SIMILARITY_THRESHOLD` | `0.68` | インクリメンタルグループ化でのマッチング閾値 |
| `EMBED_CLASSIFY_THRESHOLD` | `0.5` | embedding 分類の confidence 閾値（未満は LLM にエスカレーション） |

### その他

| 変数 | デフォルト | 説明 |
|---|---|---|
| `DATABASE_URL` | `postgresql://...` | PostgreSQL 接続文字列 |
| `NEWSDATA_API_KEY` | （空） | [NewsData.io](https://newsdata.io/) の API キー（任意） |

### モデルの変更

分析の精度や速度はモデルによって変わります。`OLLAMA_MODEL` を変更することで切り替えられます。

| モデル | VRAM目安 | 特徴 |
|---|---|---|
| `llama3.2` | ~2GB | 速い・軽い |
| `gemma3:4b` | ~3GB | 日本語対応・軽量 |
| `gemma3:12b` | ~8GB | 日本語が強い・バランス良好（デフォルト） |

```bash
# モデルをダウンロードして切り替える例
ollama pull gemma3:12b
# .env.local の OLLAMA_MODEL=gemma3:12b に変更
```

---

## NewsData.io の設定（任意）

[NewsData.io](https://newsdata.io/) の無料プランに登録してAPIキーを取得すると、追加のニュースソースが利用できます。`.env.local` の `NEWSDATA_API_KEY` に設定してください。
