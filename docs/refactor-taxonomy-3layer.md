# リファクタリング: 3層分類体系への移行

## 目的

`topic`（category相当の値が入っていた）を `category` にリネームし、
`topic` をグループ化で生成される動的なイベント名として再定義する。

```
変更前: category（なし）> subcategory > topic（= category相当）
変更後: category > subcategory > topic（= groupTitle, 動的）
```

### 3層の定義

| 層 | 性質 | 決定方法 | 例 |
|---|------|---------|-----|
| **category** | 静的・8種固定 | embedding → LLM → キーワード | `politics` |
| **subcategory** | 静的・category毎4〜5個 | 同上 | `diplomacy` |
| **topic** | 動的・グループ化で生成 | LLM命名（groupTitle） | `イラン核合意交渉` |

---

## 変更一覧

### 1. `src/types/index.ts`

```diff
 interface RssFeedItem {
-  topic?: string;       // カテゴリID（"politics" | "economy" | ...）
+  category?: string;    // 大分類（"politics" | "economy" | ...）
   subcategory?: string;
 }

 interface NewsGroup {
   groupTitle: string;
-  topic?: string;            // 支配的トピック（TopicId | "other"）
+  topic?: string;            // = groupTitle（具体的イベント名）
+  category?: string;         // グループ内の支配的 category
+  subcategory?: string;      // グループ内の支配的 subcategory
   items: RssFeedItem[];
   singleOutlet: boolean;
 }
```

---

### 2. `prisma/schema.prisma`

```diff
 model RssArticle {
-  topic       String?
+  category    String?
   subcategory String?
 }
```

マイグレーション:
```sql
ALTER TABLE "RssArticle" RENAME COLUMN "topic" TO "category";
```

---

### 3. `src/lib/news-classifier-llm.ts`

- `classifyByEmbedding()` / `classifyBatchWithLLM()` の返却フィールド: `topic` → `category`
- LLMプロンプト内の `topic` → `category`

---

### 4. `src/lib/topic-classifier.ts`

- `classifyTopic()` の返却フィールド: `topic` → `category`

---

### 5. `src/lib/rss-parser.ts`

- `item.topic` への代入 → `item.category`

---

### 6. `src/lib/db.ts`

- `RssArticle` の `topic` カラム参照 → `category`
- `getRssArticlesSince()` 等のマッピング修正

---

### 7. `src/lib/news-grouper.ts`

```diff
-function dominantTopic(items: RssFeedItem[]): string {
-  const t = item.topic ?? "other";
+function dominantCategory(items: RssFeedItem[]): string {
+  const t = item.category ?? "other";

 // NewsGroup 構築時:
-topic: dominantTopic(cluster.items),
+topic:       titles[i],                      // groupTitle = topic
+category:    dominantCategory(cluster.items),
+subcategory: dominantSubcategory(cluster.items),
```

`dominantSubcategory()` も同様に追加実装する。

---

### 8. `src/app/api/rss/route.ts`

- 分類結果の受け渡しフィールド変更（`topic` → `category`）

---

### 9. `src/app/api/bias/coverage/route.ts`

```diff
-topic: g.topic ?? "other",
+topic:    g.topic ?? g.groupTitle,
+category: g.category ?? "other",
```

---

### 10. UIコンポーネント群

`topic` を参照している箇所を `category` に更新:
- `src/components/RankingFeedView.tsx`
- `src/components/RankingHeroCard.tsx`
- `src/components/RankingMediumCard.tsx`
- `src/components/RankingCompactItem.tsx`
- フィードパネル系でtopicフィルタリングがあれば同様

---

## 変更しないもの

- `src/lib/config/news-taxonomy-configs.ts` — `CategoryDef` / `SubcategoryDef` の定義はそのまま
- `FeedConfig.category` — フィードの分類ラベル（`"総合"`, `"政治"`）は別概念のため変更不要
- `/api/analyze` 系 — 3軸分析は category/subcategory/topic を使用しない

---

## 作業順序

1. `prisma/schema.prisma` 変更 + `prisma db push` + カラムリネームSQL実行
2. `src/types/index.ts`
3. `src/lib/news-classifier-llm.ts`, `src/lib/topic-classifier.ts`
4. `src/lib/rss-parser.ts`, `src/lib/db.ts`
5. `src/lib/news-grouper.ts`
6. `src/app/api/` ルート群
7. UIコンポーネント群
