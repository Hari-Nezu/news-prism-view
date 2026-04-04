# ニュース分類ロジック仕様

## 概要

記事の `topic`（カテゴリ）と `subcategory` を付与するための3段階カスケード構成。

```
Embedding分類 → LLM分類 → キーワード分類（フォールバック）
```

高速・低コストな手法から試み、確信度が足りない場合のみ次の段階へ進む。

---

## 段階1: Embedding分類

**実装**: `src/lib/news-classifier-llm.ts` — `classifyByEmbedding()`

起動時に全サブカテゴリの参照ベクトルを生成し（`initReferenceEmbeddings`）、
記事テキストとのコサイン類似度でTop-1を選ぶ。

```
参照テキスト形式: "{カテゴリラベル} {サブカテゴリラベル}: {サブカテゴリ説明}"
記事テキスト: タイトル + summary先頭300文字
```

- 閾値: `EMBED_CLASSIFY_THRESHOLD`（デフォルト `0.5`、環境変数で変更可）
- 類似度 ≥ 閾値 → 結果採用
- 類似度 < 閾値 → 段階2へエスカレーション

---

## 段階2: LLM分類

**実装**: `src/lib/news-classifier-llm.ts` — `classifyBatchWithLLM()`

Ollamaの `CLASSIFY_MODEL` に対してバッチ送信（最大1リクエストで複数記事）。

- タイムアウト: 30秒（バッチ）/ 10秒（単件）
- 温度: 0.1（決定論的に近い出力）
- 出力形式: JSON（`format: "json"`）

プロンプトにはすべてのカテゴリ・サブカテゴリの定義を含む（`buildClassificationGuide()`）。

LLM障害・タイムアウト → 段階3へフォールバック

---

## 段階3: キーワード分類（フォールバック）

**実装**: `src/lib/topic-classifier.ts` — `classifyTopic()`

タイトル + summary を結合したテキストに対して各カテゴリのキーワードリストをマッチ。

**優先順位**（先にマッチしたものが採用）:

| 優先度 | カテゴリ | 理由 |
|:--|:--|:--|
| 1 | sports | 誤分類リスクが低い固有名詞が多い |
| 2 | politics | 中東・外交など広範なキーワードを優先処理 |
| 3 | economy | 金融・財政キーワード |
| 4 | business | 企業固有キーワード |
| 5 | health | 医療キーワード |
| 6 | science_tech | 技術キーワード |
| 7 | disaster | **自然災害専用キーワードに限定**（文脈依存ワードは除外済み） |
| 8 | culture_lifestyle | その他社会・文化 |

いずれもマッチしない場合: `"other"`

### disasterを末尾にした理由

「停電」「警報」などは政治・経済記事でも登場するため、disaster を上位にすると誤分類が多発する。
→ 「緊急地震速報」「特別警報」など自然災害固有のワードに絞り、優先度を下げた。

---

## 分類体系（taxonomy）

**実装**: `src/lib/config/news-taxonomy-configs.ts`

| カテゴリ（ID） | サブカテゴリ（ID） |
|:--|:--|
| 政治 (`politics`) | 国内政局 / 選挙 / 立法 / 外交 / 安全保障 |
| 経済 (`economy`) | 金融政策 / 財政 / 物価・消費 / 貿易 / 労働市場 |
| ビジネス (`business`) | 企業決算 / M&A・再編 / スタートアップ / 雇用・人事 |
| 健康 (`health`) | 感染症 / 医療制度 / 創薬・治療 / 公衆衛生 |
| 災害 (`disaster`) | 地震・津波 / 気象災害 / 原発・産業事故 / 防災 |
| スポーツ (`sports`) | プロ野球 / サッカー / 五輪・国際大会 / その他競技 |
| 科学・技術 (`science_tech`) | AI・半導体 / 宇宙 / エネルギー / サイバーセキュリティ |
| 文化・ライフスタイル (`culture_lifestyle`) | エンタメ / 教育 / 社会問題 / 事件・司法 |

サブカテゴリが未定義・不明な場合、そのカテゴリの先頭サブカテゴリにフォールバックする（`resolveSubcategory()`）。

---

## 呼び出しフロー

### 単件分類
```
classifyArticleLLM(title, summary)
  → classifyByEmbedding()  [Embedding]
  → classifyWithLLM()      [LLM、Embedding閾値未満時]
  → fallback()             [LLM失敗時]
```

### バッチ分類（通常利用）
```
classifyArticlesBatchLLM(items[])
  → embedBatch()           [全記事を一括ベクトル化]
  → 閾値以上 → 結果確定
  → 閾値未満のみ classifyBatchWithLLM()  [LLMバッチ]
  → LLM失敗分 → fallback()
```

バッチ処理により、Embeddingで確定できた記事はLLMコストゼロ。

---
　
## 設定値

| 環境変数 | デフォルト | 説明 |
|:--|:--|:--|
| `EMBED_CLASSIFY_THRESHOLD` | `0.5` | Embedding → LLMエスカレーション閾値 |
| `CLASSIFY_MODEL` | （config参照） | LLM分類に使用するOllamaモデル |
| `OLLAMA_BASE_URL` | （config参照） | OllamaエンドポイントURL |
