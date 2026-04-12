# Security Review Report — 2026-04-12

Go API Server (Phase 2) の セキュリティレビュー結果

---

## 概要

**2つのHIGH脆弱性が検出されました** (両方ともSSRF)。ユーザー入力URLの検証が欠落しており、クラウドメタデータエンドポイントや内部サービスへの不正アクセスが可能。共通のURL検証ユーティリティを実装し、両エンドポイントで使用することで対策できます。

---

## Vuln 1: SSRF — RSS Handler

* **ファイル**: `server/internal/handler/rss.go:10-21`
* **Severity**: HIGH
* **Category**: SSRF (Full Read)
* **Confidence**: 9/10

### 説明

ユーザー提供の `feedUrl` クエリパラメータが検証なしで `gofeed.ParseURL()` に渡される。攻撃者はホスト・プロトコルを完全に制御可能。レスポンスは `writeJSON(w, feed)` でクライアントに返されるため、Full Read SSRFとなる。

### 攻撃シナリオ

```
GET /api/rss?feedUrl=http://169.254.169.254/latest/meta-data/iam/security-credentials/role-name
```

AWSメタデータエンドポイントからIAMクレデンシャルを取得。内部サービス (`http://localhost:8090/...`) へのアクセスも可能。`gofeed` がXMLライクなレスポンスをパースできる場合、内容がリークする。

### 対策

URLスキームを `http`/`https` に限定し、解決先IPがプライベートアドレス範囲でないことを検証する:

```go
// 許可されないIP範囲
// 127.0.0.0/8    (localhost)
// 10.0.0.0/8     (private)
// 172.16.0.0/12  (private)
// 192.168.0.0/16 (private)
// 169.254.0.0/16 (link-local, メタデータサーバ)
```

カスタム `http.Transport` の `DialContext` でIPチェックを行い、リダイレクト先も同様に検証する。

---

## Vuln 2: SSRF — Article Fetch Handler

* **ファイル**: `server/internal/handler/article.go:15-25` / `server/internal/scraper/fetcher.go:19`
* **Severity**: HIGH
* **Category**: SSRF (Semi-blind)
* **Confidence**: 8/10

### 説明

POSTボディの `url` フィールドが検証なしで `httpClient.Get(url)` に渡される。レスポンスはHTML解析後、`<p>` タグ内テキスト (50文字超) が `{"content": "..."}` として返却される。リダイレクト制御 (`CheckRedirect`) も未設定のため、検証バイパスも可能。

### 攻撃シナリオ

```
POST /api/fetch-article
{"url": "http://169.254.169.254/latest/meta-data/"}
```

メタデータがHTML的構造を持つ場合、クレデンシャルが抽出される。攻撃者が制御するサーバへリダイレクトさせることで、任意の内部エンドポイントにアクセスさせることも可能。

### 対策

Vuln 1 と同じ対策を共通ユーティリティとして実装し、両エンドポイントで共有する。パッケージレベルの `httpClient` に `CheckRedirect` を設定してリダイレクト先のIPも検証すること。

---

## 推奨実装順序

1. **共通URL検証ユーティリティ作成** (`server/internal/utils/url_validator.go`)
   - プロトコル制限 (http/https のみ)
   - IPアドレス検証 (プライベート範囲ブロック)
   - リダイレクト制御

2. **RSS ハンドラ修正** — ユーティリティを使用
3. **Article Fetch ハンドラ修正** — ユーティリティを使用
4. **統合テスト** — 各種SSRF攻撃パターンを検証

---

## その他の発見

* `net` 未使用 import (既に修正済み)
* `fetcher.go` での文字列連結最適化 (既に `strings.Builder` で修正済み)
* `articles.go:FindSimilarArticles` に日付範囲フィルタ追加 (既に修正済み)

---

**レビュー実施**: 2026-04-12  
**レビュアー**: Claude Code Security Review
