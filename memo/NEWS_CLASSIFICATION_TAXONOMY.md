# ニュース分類体系 — LLM活用による多階層分類設計

## 概要

現在のキーワードマッチ型分類（7カテゴリ）から、**LLMベースの3層分類体系**へ移行する設計ドキュメント。

- **Category**（8個・固定）: 最上位カテゴリ
- **Subcategory**（30-40個・半固定）: 細分化されたカテゴリ
- **Topic**（動的・自己増殖）: その時々のニュース事象・テーマ

---

## 1. 分類体系の構造

### 1.1 Category → Subcategory マッピング（初期案）

| Category | Subcategory | 説明 |
|:--|:--|:--|
| **政治** | 国内政局 | 政権運営、党内政治、内閣改造 |
|  | 選挙 | 国政選挙、地方選挙、選挙制度 |
|  | 立法 | 国会審議、法案、条例 |
|  | 外交 | 国家間の交渉、条約、首脳会談 |
|  | 安全保障 | 防衛政策、軍事、同盟 |
| **経済** | 金融政策 | 日銀政策、金利、量的緩和 |
|  | 財政 | 予算、税制、社会保障 |
|  | 物価・消費 | インフレ、デフレ、個人消費 |
|  | 貿易 | 輸出入、為替、国際経済 |
|  | 労働市場 | 雇用統計、賃金、労働条件 |
| **ビジネス** | 企業決算 | 業績発表、配当、株価 |
|  | M&A・再編 | 合併、買収、経営統合 |
|  | スタートアップ | ベンチャー企業、起業、IPO |
|  | 雇用・人事 | 採用、リストラ、人事異動 |
| **健康** | 感染症 | COVID-19、インフルエンザ、その他感染症 |
|  | 医療制度 | 健康保険、介護制度、医療政策 |
|  | 創薬・治療 | 新薬承認、臨床試験、治療法開発 |
|  | 公衆衛生 | 予防接種、公衆衛生施策、健康寿命 |
| **災害** | 地震・津波 | 地震、余震、津波 |
|  | 気象災害 | 台風、豪雨、大雪、暴風 |
|  | 原発・産業事故 | 原発事故、産業事故、化学事故 |
|  | 防災 | 防災対策、避難、警報 |
| **スポーツ** | プロ野球 | 日本シリーズ、NPB、選手 |
|  | サッカー | Jリーグ、W杯、ACL |
|  | 五輪・国際大会 | オリンピック、パラリンピック、世界選手権 |
|  | その他競技 | テニス、バスケ、相撲、格闘技など |
| **科学・技術** | AI・半導体 | 生成AI、LLM、半導体、量子コンピュータ |
|  | 宇宙 | 宇宙開発、ロケット、惑星探査 |
|  | エネルギー | 再生可能エネルギー、脱炭素、EV |
|  | サイバーセキュリティ | サイバー攻撃、情報漏洩、セキュリティ |
| **文化・ライフスタイル** | エンタメ | 映画、音楽、ドラマ、アニメ、芸能 |
|  | 教育 | 教育制度、受験、学習、キャリア教育 |
|  | 社会問題 | 少子化、高齢化、ジェンダー、人権、格差 |
|  | 事件・司法 | 殺人、詐欺、裁判、法務 |

---

### 1.2 Topic（具体例）

Topicは**時事的で寿命がある具体的なテーマ**。

```
政治 > 外交 > 「日米首脳会談2026年4月」
経済 > 金融政策 > 「日銀2026年4月利上げ判断」
災害 > 気象災害 > 「台風14号九州上陸」
スポーツ > サッカー > 「2026年W杯本大会」
```

**ライフサイクル**:
- Topicが初めて出現 → `active` 状態で新規作成
- 14日間記事が来ない → `dormant` へ遷移
- 再度記事が来る → `active` に戻す
- 30日 `dormant` 状態が続く → アーカイブ（検索のみ可能）

---

## 2. データ構造

### 2.1 Category 定義

```typescript
interface CategoryDef {
  id: string;                    // "politics"
  label: string;                 // "政治"
  icon?: string;                 // "🏛️"
  description: string;           // LLMに渡す分類基準説明
}

// 初期化: src/lib/news-taxonomy-configs.ts に hardcode
export const CATEGORIES: Record<string, CategoryDef> = {
  politics: {
    id: "politics",
    label: "政治",
    icon: "🏛️",
    description: "政権、国会、選挙、外交、防衛に関する報道"
  },
  // ... other categories
};
```

### 2.2 Subcategory 定義

```typescript
interface SubcategoryDef {
  id: string;                    // "diplomacy"
  categoryId: string;            // "politics"
  label: string;                 // "外交"
  description: string;           // "国家間の交渉・条約・首脳会談に関する報道"
}

export const SUBCATEGORIES: SubcategoryDef[] = [
  {
    id: "diplomacy",
    categoryId: "politics",
    label: "外交",
    description: "国家間の交渉、条約調印、首脳会談、国際会議"
  },
  // ... others
];
```

### 2.3 Topic レコード（DB保存）

```typescript
interface TopicRecord {
  id: string;                    // UUID or slug
  label: string;                 // "日米首脳会談2026年4月"
  categoryId: string;            // "politics"
  subcategoryId: string;         // "diplomacy"
  embedding: number[];           // centroid vector (768次元)
  articleCount: number;          // 紐づいた記事数
  firstSeenAt: Date;             // 初出現日時
  lastSeenAt: Date;              // 最後に紐づいた記事の日時
  status: "active" | "dormant" | "archived" | "merged";
  mergedInto?: string;           // 統合先TopicのID（status="merged"時）
  confidence?: number;           // 0.0 ~ 1.0（新規提案時の確信度）
}
```

Prismaスキーマ例:

```prisma
model Topic {
  id              String   @id @default(cuid())
  label           String
  categoryId      String
  subcategoryId   String
  embedding       Float[]  @db.Vector(768)
  articleCount    Int      @default(0)
  firstSeenAt     DateTime @default(now())
  lastSeenAt      DateTime @updatedAt
  status          String   @default("active")
  mergedInto      String?
  confidence      Float?
  articles        Article[]

  @@index([categoryId, subcategoryId])
  @@index([status])
}
```

---

## 3. 分類フロー（LLM呼び出し）

### 3.1 分類ステップ

```
記事（タイトル + 要約）
  │
  ├─ Step 1: LLMで Category + Subcategory を判定
  │   （定義リストを system prompt に含める）
  │   → { category, subcategory, confidence }
  │
  ├─ Step 2: embedding で既存 Topic にマッチ試行
  │   ├─ 類似度 ≥ 閾値 (0.70) → 既存Topicに紐づけ
  │   └─ 類似度 < 閾値 → Step 3 へ
  │
  └─ Step 3: LLMに「新しいトピック名を提案して」と依頼
      → TopicRecord を新規作成（status="active"）
```

### 3.2 Step 1: Category + Subcategory 判定用 Prompt

```
あなたはニュース分類の専門家です。
以下のニュース記事を、与えられたカテゴリ・サブカテゴリで分類してください。

【記事】
タイトル: {title}
要約: {summary}

【分類基準】

## 政治
- 国内政局: 政権運営、党内政治、内閣改造
- 選挙: 国政選挙、地方選挙、選挙制度
- 立法: 国会審議、法案、条例
- 外交: 国家間の交渉、条約、首脳会談
- 安全保障: 防衛政策、軍事、同盟

## 経済
- 金融政策: 日銀政策、金利、量的緩和
- 財政: 予算、税制、社会保障
... （以降、全カテゴリ/サブカテゴリを列挙）

## 出力フォーマット
必ずJSON形式で以下の構造で回答してください。説明文は不要。

{
  "category": "politics",
  "subcategory": "diplomacy",
  "confidence": 0.92,
  "reasoning": "日米首脳会談に関する記事のため"
}
```

### 3.3 Step 3: Topic 提案用 Prompt

```
以下の記事は既存のトピックに該当しない新しいニュース事象と判定されました。
簡潔で分かりやすい日本語のトピック名（15-25字程度）を提案してください。

【記事】
タイトル: {title}
要約: {summary}

【判定済み分類】
- カテゴリ: 政治
- サブカテゴリ: 外交

## 出力フォーマット
{
  "topic": "日米首脳会談2026年4月",
  "confidence": 0.85,
  "explanation": "新しい時期の日米外交協議のため独立したトピックとして分類"
}
```

---

## 4. 自己修正メカニズム

### 4.1 Topic のライフサイクル管理（自動）

**月次バッチ**（またはリアルタイムチェック）で実行:

```typescript
async function updateTopicLifecycle(): Promise<void> {
  const topics = await db.topic.findMany();

  for (const topic of topics) {
    const daysSinceLastSeen = Math.floor(
      (Date.now() - topic.lastSeenAt.getTime()) / (24 * 60 * 60 * 1000)
    );

    if (topic.status === "active" && daysSinceLastSeen >= 14) {
      // active → dormant
      await db.topic.update(topic.id, { status: "dormant" });
    } else if (topic.status === "dormant" && daysSinceLastSeen >= 30) {
      // dormant → archived
      await db.topic.update(topic.id, { status: "archived" });
    }
  }
}
```

### 4.2 低信頼度記事の検出と Subcategory 改善提案

```typescript
async function detectLowConfidencePatterns(): Promise<void> {
  // confidence < 0.5 の記事を月別集計
  const lowConfidenceArticles = await db.article.findMany({
    where: { topicConfidence: { lt: 0.5 } },
    orderBy: { analyzedAt: "desc" }
  });

  // 特定 Subcategory に低信頼度記事が偏ってないか確認
  const bySubcategory = groupBy(lowConfidenceArticles, "subcategoryId");

  for (const [subcategoryId, articles] of Object.entries(bySubcategory)) {
    if (articles.length >= 20) {
      // アラート: 「外交」に判定困難な記事が多い
      // → description 見直し or Subcategory分割提案フロー
      console.warn(`Low confidence pattern in ${subcategoryId}: ${articles.length} articles`);
    }
  }
}
```

### 4.3 Subcategory の自動分割提案（半自動）

```typescript
async function proposeSubcategorySplit(
  subcategoryId: string
): Promise<{
  keep: string;
  proposed: string[];
  rationale: string;
} | null> {
  const articles = await db.article.findMany({
    where: { subcategoryId },
    take: 100  // 直近100件
  });

  if (articles.length < 50) return null;  // 提案条件外

  // 記事の embeddings をクラスタリング → 異なるテーマの存在を検出
  const clusters = kMeansClustering(articles.map(a => a.embedding), 3);

  if (clusters.length <= 1) return null;  // 十分に同質

  // LLMに分割提案を依頼
  const response = await llm.generate({
    prompt: `
      以下の「${subcategoryId}」カテゴリの記事は複数のテーマに分かれているようです。
      適切な分割案を提案してください。

      サンプル記事:
      ${clusters.map((c, i) => `
        【クラスタ${i}】
        ${c.articles.slice(0, 3).map(a => a.title).join('\n')}
      `).join('\n')}
    `,
    format: "json"
  });

  // 戻り値: { keep, proposed, rationale }
  return JSON.parse(response);
}
```

**重要**: 分割は**提案→承認**のフロー。自動適用せず。

### 4.4 Topic のマージング（手動+提案）

同じテーマで複数の Topic が生成された場合（「日米首脳会談2026年4月」「日米協議」など）:

```typescript
async function detectAndMergeTopics(): Promise<void> {
  const topics = await db.topic.findMany({ where: { status: "active" } });

  for (let i = 0; i < topics.length; i++) {
    for (let j = i + 1; j < topics.length; j++) {
      const sim = cosineSimilarity(topics[i].embedding, topics[j].embedding);

      if (sim >= 0.85) {
        // LLMに「どっちの名前が良いか」判定させる
        const better = await llm.judgeTopicName(topics[i], topics[j]);

        // 一方を削除、他方にリダイレクト
        await db.topic.update(topics[better === "a" ? j : i].id, {
          status: "merged",
          mergedInto: topics[better === "a" ? i : j].id
        });

        console.log(`Topics merged: "${topics[i].label}" ← "${topics[j].label}"`);
      }
    }
  }
}
```

---

## 5. 実装の段階分け

| Phase | 内容 | 所要期間 |
|:--|:--|:--|
| **Phase 1** | Category/Subcategory を固定定義。LLMで2層分類（今のキーワード分類を置き換え）。Topicは無し。 | 1-2週間 |
| **Phase 2** | Topic層を追加。embedding 類似度で既存Topic割り当て + LLM新規命名。ライフサイクル管理（active/dormant/archived）。 | 2-3週間 |
| **Phase 3** | 低信頼度検出 + Subcategory 分割提案。Topic マージング検出。 | 2週間 |

---

### Phase 1 実装ロードマップ

**ファイル構成**:

```
src/lib/
├── news-taxonomy-configs.ts    # CATEGORIES, SUBCATEGORIES
└── news-classifier-llm.ts      # classifyArticleWithLLM()

src/app/api/
└── classify/                    # POST /api/classify
    ├── route.ts
    └── test.ts

src/__tests__/lib/
└── news-classifier-llm.test.ts
```

**実装タスク**:

1. `news-taxonomy-configs.ts` に CATEGORIES/SUBCATEGORIES 定義
2. `classifyArticleWithLLM(title, summary)` 実装 → Step 1 Prompt送信
3. `/api/classify` エンドポイント実装
4. `src/app/page.tsx` の分類ロジック更新（キーワード → LLM）
5. Topicは今は保存せず、フロントで表示の際は `{category}/{subcategory}` で統一

---

## 6. 利点と注意点

### 利点

✅ キーワード漏れがない（自然言語ベース）
✅ 時勢の変化に強い（Topic で新テーマ自動吸収）
✅ 人間が分類基準を理解しやすい（description で明示化）
✅ LLM の汎化力を活かせる（微調整不要）

### 注意点

⚠️ Ollama負荷増加（記事ごと2回LLM呼び出し）
⚠️ Category/Subcategory 変更は慎重に（互換性崩壊）
⚠️ Topic 増殖無制限 → 定期的な cleanup が必須
⚠️ LLM精度に依存（hallucination の可能性）

---

## 7. 次のステップ

- [ ] Phase 1 設計確認
- [ ] Category/Subcategory リスト確定
- [ ] system prompt デモ実行
- [ ] 開発開始（Phase 1）
