# ニュース分類体系

## 3層構造

```
category > subcategory > topic
  政治   >   国際情勢   > イラン情勢
  経済   >   金融政策   > 日銀利上げ観測
  災害   >   地震・津波  > 能登半島地震
```

| 層 | 粒度 | 決定方法 | 例 |
|---|------|---------|-----|
| **category** | 大分類（8種固定） | embedding分類 → LLM → キーワード | `politics` |
| **subcategory** | 中分類（category毎に4〜5個固定） | 同上 | `diplomacy` |
| **topic** | 具体的イベント/テーマ（動的・無限） | グループ化時にクラスタから導出 | `イラン核合意交渉` |

### category と subcategory は事前定義（静的）

分類器が記事単位で付与する。変更頻度が低い。

### topic はグループ化の産物（動的）

同一イベントの記事クラスタに対してLLMが命名する `groupTitle` がそのまま topic になる。
事前定義せず、記事の集まりから自然に生成される。

---

## カテゴリ定義

**実装**: `src/lib/config/news-taxonomy-configs.ts`

| category | subcategory |
|:--|:--|
| 政治 (`politics`) | 国内政局 / 選挙 / 立法 / 外交 / 安全保障 |
| 経済 (`economy`) | 金融政策 / 財政 / 物価・消費 / 貿易 / 労働市場 |
| ビジネス (`business`) | 企業決算 / M&A・再編 / スタートアップ / 雇用・人事 |
| 健康 (`health`) | 感染症 / 医療制度 / 創薬・治療 / 公衆衛生 |
| 災害 (`disaster`) | 地震・津波 / 気象災害 / 原発・産業事故 / 防災 |
| スポーツ (`sports`) | プロ野球 / サッカー / 五輪・国際大会 / その他競技 |
| 科学・技術 (`science_tech`) | AI・半導体 / 宇宙 / エネルギー / サイバーセキュリティ |
| 文化・ライフスタイル (`culture_lifestyle`) | エンタメ / 教育 / 社会問題 / 事件・司法 |

---

## フィールドマッピング（現状 → 修正後）

### 現状の問題

`RssFeedItem.topic` に category 相当の値（`"politics"`）が格納されている。
名前と実体が一致していない。

### 修正後のフィールド

```typescript
interface RssFeedItem {
  category?: string;     // "politics" — 大分類（旧 topic）
  subcategory?: string;  // "diplomacy" — 中分類（変更なし）
  // topic は RssFeedItem 単体には持たない
  // → グループ化後の NewsGroup.topic で表現
}

interface NewsGroup {
  groupTitle: string;    // LLM命名 "イラン核合意交渉"
  topic: string;         // = groupTitle（具体的イベント名）
  category?: string;     // グループ内の支配的 category
  subcategory?: string;  // グループ内の支配的 subcategory
  items: RssFeedItem[];
  singleOutlet: boolean;
}
```

### DB (RssArticle)

```
topic       → category にリネーム
subcategory → 変更なし
```

### DB (FeedGroup / SnapshotGroup)

```
topic → groupTitle がそのまま topic を兼ねる
category / subcategory を追加（支配的分類）
```

---

## 分類ロジック（3段階カスケード）

category と subcategory の付与に使用。topic はグループ化で別途生成。

```
Embedding分類 → LLM分類 → キーワード分類（フォールバック）
```

### 段階1: Embedding分類

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

### 段階2: LLM分類

**実装**: `src/lib/news-classifier-llm.ts` — `classifyBatchWithLLM()`

llama.cpp の `CLASSIFY_MODEL` に対してバッチ送信。

- タイムアウト: 30秒（バッチ）/ 10秒（単件）
- 温度: 0.1
- 出力形式: JSON

LLM障害・タイムアウト → 段階3へフォールバック

### 段階3: キーワード分類（フォールバック）

**実装**: `src/lib/topic-classifier.ts` — `classifyTopic()`

| 優先度 | カテゴリ | 理由 |
|:--|:--|:--|
| 1 | sports | 誤分類リスクが低い固有名詞が多い |
| 2 | politics | 中東・外交など広範なキーワード |
| 3 | economy | 金融・財政キーワード |
| 4 | business | 企業固有キーワード |
| 5 | health | 医療キーワード |
| 6 | science_tech | 技術キーワード |
| 7 | disaster | 自然災害専用キーワードに限定 |
| 8 | culture_lifestyle | その他社会・文化 |

---

## topic 生成（グループ化時）

```
記事クラスタ → LLM命名 → groupTitle = topic
```

- グループ内記事の共通テーマを20字以内で抽出
- 特定記事タイトルのコピーではなく抽象化した名称
- LLM失敗時: 複数記事の共通ワードを抽出（fallbackTitle）

**実装**: `src/lib/news-grouper.ts` — `nameGroupClusters()`

---

## 設定値

| 環境変数 | デフォルト | 説明 |
|:--|:--|:--|
| `EMBED_CLASSIFY_THRESHOLD` | `0.5` | Embedding → LLMエスカレーション閾値 |
| `CLASSIFY_MODEL` | （config参照） | LLM分類に使用するモデル |
| `LLM_BASE_URL` | （config参照） | llama.cppエンドポイントURL |

---

## 実装変更の影響範囲

| ファイル | 変更内容 |
|---------|---------|
| `src/types/index.ts` | `RssFeedItem.topic` → `category`、`NewsGroup` に `category`/`subcategory` 追加 |
| `prisma/schema.prisma` | `RssArticle.topic` → `category` リネーム |
| `src/lib/news-classifier-llm.ts` | 返却フィールド名を `topic` → `category` に |
| `src/lib/topic-classifier.ts` | 同上 |
| `src/lib/news-grouper.ts` | `dominantTopic` → `dominantCategory`、`NewsGroup` に category/subcategory 付与 |
| `src/lib/rss-parser.ts` | フィールド名変更 |
| `src/app/api/rss/route.ts` | フィールド名変更 |
| UIコンポーネント群 | `topic` 参照箇所の更新 |
