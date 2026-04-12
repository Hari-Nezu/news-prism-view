# server/ テスト計画

## 概要

現在テストファイルはゼロ。外部依存（DB・LLM API・外部HTTP）が多いため、**純粋ロジックのユニットテスト → httptest によるハンドラテスト → モックサーバーによる統合テスト** の順に進める。

---

## Phase 1: 純粋ロジック（外部依存なし）

最も費用対効果が高い。モック不要で即実装可能。

### 1-1. `internal/rss/filter_test.go` — FilterByKeyword

| ケース | 入力 | 期待 |
|:--|:--|:--|
| 空キーワード | `keyword=""`, items 3件 | 全件返却 |
| タイトル一致 | `keyword="経済"`, Title に「経済」含む item | 1件マッチ |
| Description 一致 | `keyword="政策"`, Description に含む | マッチ |
| 大文字小文字無視 | `keyword="ABC"`, Title="abc news" | マッチ |
| マッチなし | 無関係な items | 空スライス |
| nil items | `items=nil` | nil 返却 |

### 1-2. `internal/grouper/grouper_test.go` — groupGreedy + ヘルパー

`groupGreedy` は unexported だが同パッケージからテスト可能。

| 関数 | ケース |
|:--|:--|
| `groupGreedy` | embedding なし記事 → 各記事が独立クラスタ |
| `groupGreedy` | 同一ベクトル2記事 (threshold=0.8) → 1クラスタに統合 |
| `groupGreedy` | 直交ベクトル2記事 → 別クラスタ |
| `groupGreedy` | カテゴリゲート: 異カテゴリは sim 高くても別クラスタ |
| `groupGreedy` | セントロイド増分更新の正確性（3記事追加後の centroid 検証） |
| `isSingleOutlet` | 同一 Source → true |
| `isSingleOutlet` | 異なる Source → false |
| `isSingleOutlet` | 1件 → true |
| `dominantCategory` | 最多カテゴリが返る |
| `dominantSubcategory` | 空文字除外して最多が返る |
| `fallbackTitle` | 20文字超 → 切り詰め |
| `fallbackTitle` | 空 Articles → "無題" |

### 1-3. `shared/db/helpers_test.go` — CosineSimilarity, MeanVector, parseVectorStr

| 関数 | ケース |
|:--|:--|
| `CosineSimilarity` | 同一ベクトル → 1.0 |
| `CosineSimilarity` | 直交 → 0.0 |
| `CosineSimilarity` | 逆方向 → -1.0 |
| `CosineSimilarity` | 長さ不一致 → 0 |
| `CosineSimilarity` | 空スライス → 0 |
| `MeanVector` | 2ベクトルの平均 |
| `MeanVector` | 空入力 → nil |
| `parseVectorStr` | `"[1.0,2.0,3.0]"` → `[]float32{1,2,3}` |
| `parseVectorStr` | 空文字 → nil |

### 1-4. `internal/rss/parser_test.go` — LoadFeeds

| ケース | 入力 | 期待 |
|:--|:--|:--|
| 正常YAML | tmpfile に feeds YAML | FeedConfig スライス |
| 不正YAML | 壊れた YAML | error |
| 存在しないパス | `/nonexistent` | error |

### 1-5. `internal/classifier/classifier_test.go` — truncate

| ケース | 入力 | 期待 |
|:--|:--|:--|
| 短い文字列 | len < max | そのまま |
| 日本語切り詰め | 400文字以上 | rune 単位で max |

### 1-6. `internal/middleware/cors_test.go`

| ケース | 期待 |
|:--|:--|
| OPTIONS → 204 | レスポンスヘッダに CORS 系3ヘッダ |
| GET → next 呼出 | CORS ヘッダ付きで next に委譲 |

---

## Phase 2: ハンドラテスト（httptest + モック依存）

`Deps` の各フィールドをモック化して `httptest.NewRecorder` でテスト。

### モック戦略

LLM/DB は具象型（`*llm.ChatClient`, `*db.Pool`）のため、**httptest.NewServer で偽 LLM API を立てる** or **インターフェース抽出** が必要。

**推奨: httptest.NewServer による偽 LLM サーバー**
- `llm.NewChatClient("http://localhost:XXXX", "test-model")` で差し替え可能（インターフェース変更不要）
- DB は `pgxpool` なので testcontainers-go or スキップ

### 2-1. `internal/handler/classify_test.go`

| ケース | 入力 | 期待 |
|:--|:--|:--|
| 正常リクエスト | `{"title":"テスト","summary":"..."}` | 200 + ClassificationResult JSON |
| title 空 | `{"title":""}` | 400 "title is required" |
| 不正 JSON | `{broken` | 400 "invalid request" |
| LLM エラー | 偽サーバーが 500 返却 | 500 |

### 2-2. `internal/handler/analyze_test.go`

| ケース | 入力 | 期待 |
|:--|:--|:--|
| 正常（single model） | title + content (≥10文字) | 200 + analysis JSON |
| content 短すぎ | len(content) < 10 | 400 |
| title 空 | `{"title":""}` | 400 |

### 2-3. `internal/handler/batch_test.go`

| ケース | 期待 |
|:--|:--|
| `BatchRun` — 偽 batch サーバー 200 | `{"ok": true}` |
| `BatchRun` — 偽 batch サーバー 500 | 502 |
| `BatchRun` — 偽 batch サーバー接続不可 | 502 |
| `BatchInspect` — id 未指定 | 400 |

### 2-4. `internal/handler/rss_test.go`

| ケース | 期待 |
|:--|:--|
| feedUrl 未指定 | 400 |

### 2-5. `internal/handler/history_test.go`

| ケース | 期待 |
|:--|:--|
| `HistorySimilar` — limit 未指定 | デフォルト 10 適用 |
| `HistorySimilar` — limit > 100 | 100 に制限 |
| `HistorySimilar` — 不正 JSON | 400 |

### 2-6. `internal/handler/helpers_test.go`

| 関数 | ケース |
|:--|:--|
| `writeJSON` | Content-Type: application/json, ボディ検証 |
| `writeError` | ステータスコード + error JSON |

### 2-7. `internal/handler/register_test.go`

| ケース | 期待 |
|:--|:--|
| 全ルート登録確認 | 各パスに GET/POST でリクエスト → 404 でないこと |

---

## Phase 3: 統合テスト（DB + 偽 LLM）

`testcontainers-go` で PostgreSQL + pgvector コンテナを起動。

### 3-1. `internal/scraper/fetcher_test.go`

- httptest.NewServer で HTML を返す偽サーバー
- `<article><p>` あり → 本文抽出
- `<p>` のみ（50文字超） → 抽出
- 短い `<p>` のみ → エラー（"could not extract content"）

### 3-2. `internal/sse/writer_test.go`

- httptest.NewRecorder で SSE フォーマット検証
- `Init()` → Content-Type: text/event-stream
- `Send("event", data)` → `event: event\ndata: {...}\n\n`
- `Comment("msg")` → `: msg\n\n`

### 3-3. DB 連携テスト（shared/db）

testcontainers で pgvector 付き PostgreSQL を起動:

| 関数 | ケース |
|:--|:--|
| `SaveArticle` → `GetRecentArticles` | 保存→取得ラウンドトリップ |
| `UpsertArticles` | 重複 URL は UPDATE |
| `FindSimilarArticles` | ベクトル検索結果の順序 |
| `SaveEmbeddings` → `GetUnembeddedArticles` | embedded_at 更新確認 |
| `SaveClassifications` → `GetUnclassifiedArticles` | classified_at 更新確認 |

---

## 実装優先順位

| 順位 | 対象 | 理由 |
|:--|:--|:--|
| **1** | Phase 1 全て | 外部依存ゼロ、すぐ書ける、ロジックバグの発見率高い |
| **2** | Phase 2: helpers, register, classify, history | ハンドラの入力バリデーションは重要 |
| **3** | Phase 3: scraper, sse | httptest で完結、低コスト |
| **4** | Phase 3: DB 連携 | testcontainers 導入コストあるが長期的に必須 |
| **5** | Phase 2: analyze, batch | LLM モック + 非同期処理のテストは複雑 |

---

## テスト実行コマンド

```bash
cd server && GOCACHE=../.gocache go test ./...
```

## カバレッジ目標

- Phase 1 完了時: ユーティリティ関数 100%
- Phase 2 完了時: ハンドラ入力バリデーション 100%、正常系 80%
- Phase 3 完了時: E2E パス 70%
