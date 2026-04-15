# Go プロセス内 LLM 推論設計

## 現状

- HTTP経由でllama-serverを外部呼び出し
- `shared/llm/chat.go`, `shared/llm/embed.go` — OpenAI互換API
- モデル: gemma-4-E4B-it-Q8_0 (chat), ruri-v3-310m.gguf (embed)

## 2つの実装アプローチ

### 1. 子プロセス自動管理（推奨）

llama-serverをGoプロセスの子プロセスとして起動・停止。既存HTTPクライアントそのまま使用。

#### 構成
```
Go batch process
├─ pipeline/pipeline.go (既存)
├─ shared/llm/{chat,embed}.go (既存)
└─ shared/llm/server/manager.go (新規)
     └─ exec.Command("llama-server", ...) 管理
```

#### 実装パターン
```go
// shared/llm/server/manager.go
type Manager struct {
    cmd    *exec.Cmd
    port   int
    stdout, stderr io.ReadCloser
}

func New(modelChatPath, modelEmbedPath string) *Manager { ... }
func (m *Manager) Start(ctx context.Context) error { ... }
func (m *Manager) Stop() error { ... }
func (m *Manager) Health(ctx context.Context) bool { ... }
func (m *Manager) Port() int { ... }

// batch/cmd/newsprism-batch/main.go
func main() {
    mgr := server.New(...)
    defer mgr.Stop()
    if err := mgr.Start(ctx); err != nil {
        log.Fatalf("failed to start llm server: %v", err)
    }
    
    // 既存パイプライン、そのまま使用
    // llm.NewChatClient("http://localhost:" + strconv.Itoa(mgr.Port()), ...)
}
```

#### メリット
- 既存コード変更最小（Manager追加のみ）
- ビルド・デプロイ簡潔
- GPU/Metal対応もllama-serverの設定で完結
- デバッグが容易

#### デメリット
- プロセス起動時間（秒単位）
- メモリ: llama-serverが独立プロセス

---

### 2. CGoインプロセス推論

llama.cppをCGoでリンク。シングルバイナリ化。

#### ライブラリ
- `github.com/go-skynet/go-llama.cpp` または `github.com/mudler/go-llama.cpp` （後継）

#### 実装パターン
```go
// shared/llm/local_chat.go
type LocalChatClient struct {
    model *llamago.LLama
}

func NewLocalChatClient(modelPath string) (*LocalChatClient, error) {
    m, err := llamago.New(modelPath,
        llamago.SetContext(2048),
        llamago.SetThreads(4),
    )
    if err != nil { return nil, err }
    return &LocalChatClient{model: m}, nil
}

func (c *LocalChatClient) Complete(ctx context.Context, system, user string) (string, error) {
    prompt := formatTemplate(system, user) // gemma形式テンプレート
    return c.model.Predict(prompt, llamago.SetTemperature(0.3))
}
```

#### メリット
- シングルバイナリ
- プロセス起動時間なし

#### デメリット
- **ビルド時間**: 数分（C++コンパイル）
- **ビルドフラグ**: Metal/CUDA管理必須
- **メモリ**: chat + embedモデル同時ロード → メモリ倍増
- **テンプレート管理**: gemma/llama形式を自前実装
- **既存コード全置換**: client層再設計
- **CGoデバッグ**: 複雑

---

## 判定表

| 要件 | 子プロセス | インプロセス |
|:---|:---:|:---:|
| シングルバイナリ | ✗ | ✓ |
| ビルド簡便さ | ✓ | ✗ |
| Metal/GPU対応 | ✓ | △ |
| 既存コード変更 | 小 | 大 |
| デバッグ容易さ | ✓ | ✗ |
| デプロイ複雑さ | 中（モデルファイル別途） | 低 |

---

## 推奨判断

### 選択: **子プロセス自動管理**

理由:
1. 既存HTTPクライアント再利用可（`shared/llm` 変更不要）
2. ビルド・デプロイ労力最小
3. 本番環境でのトラブルシューティング容易
4. llama-serverは別プロセス → メモリ効率（embedding + chat別VM可能）

### 選択: **CGoインプロセス** を検討する場合

- シングルバイナリが絶対要件
- ビルド・メモリ複雑さを許容できる場合のみ

---

## 実装ステップ（子プロセス管理の場合）

1. `shared/llm/server/manager.go` 作成
   - `Start(ctx)`, `Stop()`, `Health()`, `Port()`
   
2. `batch/cmd/newsprism-batch/main.go` 修正
   - Manager初期化
   - defer mgr.Stop()
   - llm.NewChatClient/EmbedClient に動的ポート渡し

3. `batch/internal/config/config.go` 修正
   - LLM_BASE_URL をデフォルト不要に（自動管理）
   - モデルパスを環境変数化（MODEL_CHAT_PATH, MODEL_EMBED_PATH）

4. テスト: バッチ単体起動で llama-server が自動起動・停止確認

