# newsprism-batch

RSS収集 → embedding → 分類 → クラスタリング → 命名 → スナップショット保存、の6ステージバッチパイプライン。

設計経緯: [`docs/batch-pipeline-design.md`](../docs/batch-pipeline-design.md)

---

## 起動

```bash
# 1回実行して終了
go run ./cmd/newsprism-batch run

# HTTPサーバー + 毎時cronとして常駐
go run ./cmd/newsprism-batch serve
```

### HTTPエンドポイント（serveモード）

| メソッド | パス | 説明 |
|---------|------|------|
| `POST` | `/run` | パイプライン手動実行 |
| `GET` | `/health` | ヘルスチェック |

---

## 環境変数

| 変数 | デフォルト | 説明 |
|------|-----------|------|
| `DATABASE_URL` | `postgresql://newsprism:newsprism@localhost:5432/newsprism` | PostgreSQL接続先 |
| `LLM_BASE_URL` | `http://127.0.0.1:8081` | OpenAI互換LLMサーバー（命名・分類用） |
| `EMBED_BASE_URL` | `http://127.0.0.1:8081` | 埋め込みモデル用サーバー |
| `LLM_MODEL` | `gemma-4-E4B-it-Q8_0` | クラスタ命名用チャットモデル |
| `CLASSIFY_MODEL` | `gemma-4-E4B-it-Q8_0` | 分類フォールバック用チャットモデル |
| `EMBED_MODEL` | `Targoyle/ruri-v3-310m-GGUF:Q8_0` | 埋め込みモデル（310次元） |
| `GROUP_CLUSTER_THRESHOLD` | `0.72` | クラスタリングのコサイン類似度閾値 |
| `EMBED_CLASSIFY_THRESHOLD` | `0.5` | embedding分類の信頼度閾値（これ未満はLLMフォールバック） |
| `TIME_DECAY_HALF_LIFE_HOURS` | `12.0` | ランキングの時間減衰半減期（時間） |
| `BATCH_PORT` | `8090` | serveモードのポート |
| `FEEDS_YAML_PATH` | `feeds.yaml` | フィード定義ファイルパス |
| `DEBUG` | _(未設定)_ | 設定するとログレベルが DEBUG に |

---

## パイプライン（6ステージ）

```
collect → embed → classify → group → name → store
   ↓                                          ↓
RssArticle                            ProcessedSnapshot
(embedding保存)                        ├─ SnapshotGroup
                                       └─ SnapshotGroupItem
```

### 1. collect

- `feeds.yaml` の `default_enabled: true` なフィードを並行取得
- URL重複除去後、`RssArticle` にupsert
- Google News: `<source>` 要素から媒体名抽出、タイトル末尾の " - 媒体名" を除去

### 2. embed

- `embeddedAt IS NULL` かつ直近3日以内の記事を最大200件取得
- テキストに `"文章: "` プレフィックスを付与してembedding APIへ（ruri-v3の仕様）
- 2000文字に切り詰めてから送信
- `RssArticle.embedding`（310次元）と `embeddedAt` を更新

### 3. classify

- `classifiedAt IS NULL` の記事を最大200件取得
- **3フェーズ分類**:
  - Phase A: embedding コサイン類似度で分類（参照 embedding と比較、閾値: `EMBED_CLASSIFY_THRESHOLD`）
  - Phase B: 信頼度不足の記事を LLM バッチ分類にフォールバック
  - Phase C: LLM 失敗時はキーワードマッチにフォールバック
- 11カテゴリ: politics, economy, business, international, society, health, disaster, sports, science_tech, weather, culture_lifestyle
- 参照 embedding は `sync.Once` でプロセス起動時に1回ロード（taxonomy のサブカテゴリ説明文を embed）
- `RssArticle.category`, `subcategory`, `classifiedAt` を更新

### 4. group

- 直近3日以内のembedding済み記事を取得
- **グリーディコサイン類似度クラスタリング**（閾値: `GROUP_CLUSTER_THRESHOLD`）
- **同一カテゴリのクラスタにしか参加できない**（hard gate）
- unknown カテゴリ（`""` または `"other"`）は例外レーン扱いで、unknown同士のみ結合可（閾値 +0.05）
- embeddingなし記事は単独クラスタ扱い

### 5. name

- クラスタ内の記事タイトル一覧をLLMに送信し、日本語タイトル（20文字以内）を生成
- JSON形式で返却させる（`response_format: json_object`、temperature: 0.1）
- LLM失敗時: 記事タイトルのn-gram（2〜6文字、50%以上出現）をフォールバック

### 6. store

- クラスタをランク付け（複数媒体掲載 → 媒体数 → 記事数の順）
- 媒体カバレッジ追跡: `coveredBy`（掲載媒体）、`silentMedia`（未掲載媒体）
- `ProcessedSnapshot` + `SnapshotGroup` + `SnapshotGroupItem` をトランザクション保存
- 7日より古いスナップショットを自動削除

---

## フィード定義（feeds.yaml）

```yaml
feeds:
  - id: nhk
    url: "https://www.nhk.or.jp/rss/news/cat0.xml"
    type: rss                  # "rss" or "google-news"
    category: 総合
    filter_political: false    # trueにすると政治・経済キーワードでフィルタ
    default_enabled: true
  - id: yomiuri
    url: "https://news.google.com/rss/search?q=site:yomiuri.co.jp&hl=ja&gl=JP&ceid=JP:ja"
    type: google-news
    category: 総合
    filter_political: false
    default_enabled: true
    canonical_source: "読売新聞"  # Google Newsで表示される媒体名を上書き
```

現在 `default_enabled: true` は大手メディア15社（NHK・朝日・毎日・産経・東洋経済・ハフポスト・読売・日経・東京・時事・共同・TBS・テレ朝・日テレ・フジ）。Google News トピック検索（政治・経済・国際）は `default_enabled: false`。

---

## 排他制御

PostgreSQL advisory lockを使用。同時実行を防ぐ。プロセスクラッシュ時はDB接続切断で自動解放。

```
lock key: 123456789 (固定)
```

---

## DBスキーマ

Prismaが管理する `RssArticle` と、Go側マイグレーション（`migrations/001_snapshot_tables.sql`）が管理する3テーブル。

| テーブル | 管理 | 役割 |
|---------|------|------|
| `RssArticle` | Prisma | 記事本体 + embedding + 分類 |
| `ProcessedSnapshot` | Go migration | パイプライン実行記録 |
| `SnapshotGroup` | Go migration | グループ（クラスタ）情報 |
| `SnapshotGroupItem` | Go migration | グループ内の各記事 |

**注意**: `RssArticle.embedding` は `Unsupported("vector(310)")` のため、PrismaからはCRUD不可。生SQL必須。

---

## LLMサーバー前提

llama.cppなどのOpenAI互換サーバーが `LLM_BASE_URL` で起動していること。
未起動時はembed/nameステージが失敗し、`status: "partial"` でスナップショットが記録される。

```bash
# 例: llama-server起動
llama-server --port 8081 --model ruri-v3-310m.gguf --embeddings
```
