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
ollama pull nomic-embed-text

docker compose -f docker-compose.local-ollama.yml up
```

---

### C. ローカル開発（コードを変更しながら使う）

```bash
# DB と Ollama だけ Docker で起動
docker compose up db ollama ollama-init

# アプリをローカルで起動
cp .env.local.example .env.local
npx prisma db push
npm run dev
```

---

## 環境変数

`.env.local.example` をコピーして `.env.local` を作成してください。

```bash
cp .env.local.example .env.local
```

| 変数 | デフォルト | 説明 |
|---|---|---|
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama サーバーの URL |
| `OLLAMA_MODEL` | `llama3.2` | 分析に使う LLM モデル |
| `EMBED_MODEL` | `nomic-embed-text` | 類似記事検索用の埋め込みモデル |
| `DATABASE_URL` | `postgresql://...` | PostgreSQL 接続文字列 |
| `NEWSDATA_API_KEY` | （空） | [NewsData.io](https://newsdata.io/) の API キー（任意） |

### モデルの変更

分析の精度や速度はモデルによって変わります。`OLLAMA_MODEL` を変更することで切り替えられます。

| モデル | VRAM目安 | 特徴 |
|---|---|---|
| `llama3.2` | ~2GB | 速い・軽い（デフォルト） |
| `gemma3:12b` | ~8GB | 日本語が強い・バランス良好 |
| `llama3.1:8b` | ~5GB | 英語が強い |

```bash
# モデルをダウンロードして切り替える例
ollama pull gemma3:12b
# .env.local の OLLAMA_MODEL=gemma3:12b に変更
```

---

## NewsData.io の設定（任意）

[NewsData.io](https://newsdata.io/) の無料プランに登録してAPIキーを取得すると、追加のニュースソースが利用できます。`.env.local` の `NEWSDATA_API_KEY` に設定してください。
