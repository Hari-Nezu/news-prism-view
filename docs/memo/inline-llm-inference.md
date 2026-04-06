# LLM推論のバッチ内インライン化

## 現状

llama-server を別プロセスで常駐させ、HTTP API 経由で呼び出している。

```
newsprism-batch  ──HTTP──▶  llama-server (:8081)
                              ├─ /v1/embeddings   (ruri-v3-310m, 768次元)
                              └─ /v1/chat/completions (gemma-4, naming用)
```

**問題点:**
- llama-server を別途起動・管理する運用コスト
- HTTP往復のオーバーヘッド（embedding は1記事ずつ × 最大200件）
- llama-server 未起動でバッチが `partial` になる
- 2プロセス分のメモリ消費

---

## 方式比較

### A: llama.cpp CGo バインディング

Go プロセス内で llama.cpp の C ライブラリを直接呼び出す。

```
newsprism-batch (Go + CGo)
  └─ libllama (C/C++)
       ├─ embedding model (ruri-v3-310m.gguf)
       └─ chat model (gemma-4.gguf)
```

| 項目 | 評価 |
|------|------|
| 外部依存 | なし（単一バイナリ） |
| HTTP往復 | なし |
| 推論速度 | 最速（プロセス内、ゼロコピー） |
| Metal/CUDA | llama.cpp が対応済み |
| ビルド複雑度 | **高**: CGo + C++コンパイラ + Metal framework リンクが必要 |
| クロスコンパイル | **困難**: ターゲットごとにネイティブビルド必須 |
| モデルロード | バッチ起動ごとにロード（`serve` モードなら初回のみ） |
| メモリ管理 | 2モデル同時ロードで消費大。逐次ロード/アンロードは可能だが実装コスト高 |

**Go バインディング候補:**
- [`go-llama.cpp`](https://github.com/go-skynet/go-llama.cpp) — メンテ停滞気味
- [`llama.go`](https://github.com/nicholasgasior/llama.go) — 軽量だが機能限定
- 自前 CGo ラッパー — 確実だが工数大

### B: サブプロセス管理

Go から llama-server をサブプロセスとして起動し、既存の HTTP インターフェースをそのまま使う。バッチ終了時に kill。

```
newsprism-batch (Go)
  ├─ os/exec: llama-server --port 8081 --model ruri.gguf --embeddings
  ├─ HTTP ──▶ localhost:8081
  └─ os.Process.Kill() on exit
```

| 項目 | 評価 |
|------|------|
| 外部依存 | llama-server バイナリが必要（ただし自動管理） |
| HTTP往復 | あり（localhost なので低遅延） |
| 推論速度 | 現状と同等 |
| ビルド複雑度 | **低**: 純Go、CGo不要 |
| クロスコンパイル | Go バイナリ自体は容易。llama-server は別途用意 |
| モデルロード | パイプライン開始時にロード、終了時に解放 |
| メモリ管理 | 使わない時はプロセスごと消える |
| 運用 | llama-server のパスを設定するだけ |

### C: ONNX Runtime（embedding限定）

ruri-v3 を ONNX 形式に変換し、Go の ONNX Runtime バインディングで推論。chat は現状維持（HTTP or 廃止）。

```
newsprism-batch (Go)
  ├─ onnxruntime-go: ruri-v3.onnx → embedding
  └─ HTTP ──▶ llama-server (chat のみ、or 廃止して fallback title)
```

| 項目 | 評価 |
|------|------|
| 外部依存 | ONNX Runtime 共有ライブラリ (.dylib/.so) |
| 推論速度 | 高速（ONNX は推論特化） |
| ビルド複雑度 | 中: CGo不要だが共有ライブラリの配置が必要 |
| モデル変換 | GGUF → ONNX の変換が必要（Hugging Face 経由） |
| Metal/CUDA | ONNX Runtime の CoreML/CUDA EP で対応可 |
| chat 対応 | 非対応（embedding 専用）。name ステージは fallback or 別手段 |

---

## 推奨: 方式B（サブプロセス管理）

**理由:**

1. **既存コードの変更が最小**: HTTP クライアント (`llm/embed.go`, `llm/chat.go`) はそのまま。追加するのはプロセス管理だけ
2. **CGo 不要**: ビルドが壊れやすい CGo を避けられる。Go のクロスコンパイルの利点を維持
3. **メモリ効率**: `run` モードではバッチ終了時にモデルプロセスが消える。常駐と違い使わない時間のメモリを食わない
4. **段階的移行**: 現状の「手動で llama-server 起動」から「自動管理」への変更なので、ロールバックが容易

### 実装設計

```go
// internal/llm/server.go

type ServerProcess struct {
    cmd     *exec.Cmd
    baseURL string
}

// Start spawns llama-server and waits until /health returns 200.
func StartServer(cfg ServerConfig) (*ServerProcess, error) {
    // 1. ポート競合チェック（既存プロセスがいればそのまま使う）
    // 2. llama-server をサブプロセス起動
    // 3. /health をポーリング（最大30秒、500ms間隔）
    // 4. 起動確認後に ServerProcess を返す
}

// Stop terminates the llama-server process.
func (s *ServerProcess) Stop() {
    // SIGTERM → 3秒待機 → SIGKILL
}
```

```go
// pipeline.go での使い方

func Run(ctx context.Context, ...) Result {
    // llama-server 起動
    srv, err := llm.StartServer(llm.ServerConfig{
        BinaryPath: cfg.LlamaServerPath,
        ModelPath:  cfg.EmbedModelPath,
        Port:       8081,
        Embeddings: true,
    })
    if err != nil { return partialResult(...) }
    defer srv.Stop()

    // 以下は既存フローそのまま
    embedClient := llm.NewEmbedClient(srv.BaseURL(), cfg.EmbedModel)
    ...
}
```

### 設定パラメータ

| パラメータ | 環境変数 | デフォルト |
|-----------|---------|-----------|
| llama-server パス | `LLAMA_SERVER_PATH` | `llama-server`（PATH検索） |
| embedding モデルファイル | `EMBED_MODEL_PATH` | `models/ruri-v3-310m-Q8_0.gguf` |
| chat モデルファイル | `CHAT_MODEL_PATH` | `models/gemma-4-E4B-it-Q8_0.gguf` |
| 推論ポート | `LLAMA_SERVER_PORT` | `8081` |
| GPU レイヤー数 | `LLAMA_N_GPU_LAYERS` | `99`（全層オフロード） |
| 起動タイムアウト | `LLAMA_STARTUP_TIMEOUT` | `60s` |

### 2モデル問題

embedding (ruri-v3) と chat (gemma-4) は異なるモデル。同時ロードするとメモリ消費が大きい。

**解決策: 逐次起動**

```
1. ruri-v3 で llama-server 起動
2. embed ステージ実行
3. llama-server 停止
4. gemma-4 で llama-server 再起動
5. name ステージ実行
6. llama-server 停止
```

モデル切り替えのオーバーヘッド（ロード10〜15秒）は、毎時バッチでは許容範囲。

### name ステージの代替: LLM廃止も検討可

現状の `name.go` は LLM 失敗時に n-gram フォールバックがある。このフォールバックの品質が十分なら、chat モデルを完全に廃止できる。

- LLMタイトル: 「日銀の利上げ決定」
- フォールバック: 「日銀 利上げ 金融政策」

フォールバックでも機能上は問題ないが、ユーザー体験としてはLLM命名の方が自然。ここは運用で判断。

---

## 将来: 方式A（CGo）への移行パス

サブプロセス管理で安定運用できた後、以下の条件が揃えば CGo 移行を検討:

- デプロイ先が固定（macOS のみ、or Linux のみ）でクロスコンパイル不要
- llama.cpp の安定した Go バインディングが成熟
- embedding 以外（分類など）もインプロセスで実行したくなった

方式B → 方式A の移行は `llm/` パッケージのインターフェースを変えるだけで、パイプライン側の変更は不要。
