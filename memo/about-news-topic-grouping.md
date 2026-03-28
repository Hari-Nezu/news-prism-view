## ニュース トピック分類の設計提案

現状の課題と、3つのアプローチを整理しました。

---

### 現状の問題

- フィードは**媒体（ソース）単位**で分類されており、トピック/テーマの概念がない
- `RssFeedItem` に `category` フィールドがない
- ユーザーは興味のあるテーマだけ追いたいが、全記事が時系列で流れてくる

---

### アプローチ比較

| | A. キーワード分類 | B. Ollama分類 | C. ハイブリッド |
|---|---|---|---|
| **方式** | 記事タイトルをキーワードマッチで分類 | LLMで各記事にトピックタグ付け | Aで高速分類 → 未分類のみBで補完 |
| **速度** | ◎ 即座 | △ 記事数×API呼び出し | ○ 大半は即座 |
| **精度** | ○ 既知トピックは高い、新トピックに弱い | ◎ 文脈理解できる | ◎ |
| **コスト** | ◎ ゼロ | △ Ollama負荷 | ○ |
| **実装量** | 小 | 中 | 中 |

### 推奨: **C. ハイブリッド**

理由：
1. RSS取得時のレスポンス速度を維持できる（キーワードで8割分類）
2. 新しいトピックや曖昧な記事もLLMで拾える
3. 分類結果をキャッシュすれば2回目以降は即座

---

### 具体的な設計

**1. トピック定義（`src/lib/topic-classifier.ts`）**

```ts
const TOPICS = {
  economy:    { label: "経済・金融", icon: "💰", keywords: ["日銀", "株価", "GDP", "円安", "金利", ...] },
  politics:   { label: "政治",       icon: "🏛️", keywords: ["国会", "首相", "選挙", "法案", ...] },
  diplomacy:  { label: "外交・安保", icon: "🌐", keywords: ["外交", "防衛", "NATO", "米中", ...] },
  tech:       { label: "テクノロジー", icon: "💻", keywords: ["AI", "半導体", "スタートアップ", ...] },
  society:    { label: "社会・暮らし", icon: "🏘️", keywords: ["少子化", "教育", "医療", "年金", ...] },
  disaster:   { label: "災害・気象", icon: "⚠️", keywords: ["地震", "台風", "避難", ...] },
  sports:     { label: "スポーツ",   icon: "⚽", keywords: [...] },
  other:      { label: "その他",     icon: "📰", keywords: [] },
} as const;
```

**2. `RssFeedItem` にフィールド追加**

```ts
interface RssFeedItem {
  // 既存フィールド...
  topic?: string;       // "economy" | "politics" | ...
  topicLabel?: string;  // "経済・金融" (表示用)
}
```

**3. 分類フロー**

```
RSS取得 → タイトルキーワードマッチ → 分類できた → topic付与
                                   → 未分類 → Ollama一括分類（バッチ）→ topic付与
```

Ollama分類はバッチで未分類記事をまとめて1回のプロンプトで処理（記事ごとにAPI呼び出しはしない）。

**4. UI変更（`RssFeedPanel.tsx`）**

```
[💰経済] [🏛政治] [🌐外交] [💻テク] [🏘社会] [全て]  ← トピックタブ（1行目）
[NHK] [朝日] [産経] [東洋経済] [ハフポスト] ...       ← ソースタブ（2行目、既存）
```

- トピックタブは排他選択（1つ選ぶとそのトピックの記事だけ表示）
- ソースタブと組み合わせ可能（「経済」×「NHK」= NHKの経済記事のみ）

**5. ユーザー設定（localStorage）**

```ts
interface FeedSettings {
  enabledIds: string[];
  customFeeds: CustomFeedEntry[];
  // 追加
  enabledTopics?: string[];  // nullなら全表示
  defaultTopic?: string;     // 起動時に開くトピック
}
```

---

### 作業ステップ

1. `topic-classifier.ts` 作成（キーワード辞書 + Ollamaバッチ分類）
2. `RssFeedItem` に `topic` フィールド追加
3. `rss-parser.ts` の `fetchAllDefaultFeeds` 内で分類実行
4. `RssFeedPanel.tsx` にトピックフィルタUI追加
5. テスト追加（`topic-classifier.test.ts`）

---

どうでしょうか？このまま実装に進めますか？トピックの分類カテゴリを変えたい、UIの見せ方を変えたいなどあれば調整します。