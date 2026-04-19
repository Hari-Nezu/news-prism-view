# フロントエンド テスト設計書

> Sonnet 実装者向け。上から順に実装すること。

---

## 0. 前提

- テストランナー: **vitest** (既存 `vitest.config.ts`)
- E2E: **Playwright** (新規導入)
- 全ページが Go API (`API_BASE + /api/...`) に依存 → テストでは **API レスポンスを mock**
- vitest の `environment: "node"` は変更しない（jsdom 不要の純粋関数テストのみ）

---

## 1. ユニットテスト — ロジック抽出 + テスト

### 方針

ページ/コンポーネント内のクロージャ関数を `src/lib/` に抽出し、純粋関数としてテスト。
既存の `environment: "node"` のまま動作する。

### 1-1. 抽出対象と抽出先 — 【DONE】

| 抽出元 | 関数 | 抽出先 | ステータス |
|:--|:--|:--|:--|
| `app/page.tsx` | `findDuplicateIndex` | `src/lib/find-duplicate.ts` | DONE |
| `app/page.tsx` | `computeMultiModelAnalysis` | `src/lib/multi-model-analysis.ts` | DONE |
| `app/inspect/page.tsx`, `app/ranking/page.tsx`, `components/CoverageMatrix.tsx`, `components/RssFeedPanel.tsx` | `formatRelative` / `formatDateTime` | `src/lib/format-time.ts` | DONE |
| `components/CoverageMatrix.tsx` | `sortGroups` | `src/lib/sort-groups.ts` | DONE |
| `components/CoverageMatrix.tsx` | `countArticles` + `MEDIA` 定数 | `src/lib/media-matcher.ts` | DONE |
| `components/RssFeedPanel.tsx` (loadFeeds 内) | URL dedup + 時系列ソート | `src/lib/dedup-feed-items.ts` | DONE |
| 全ページ共通の SSE パースパターン | SSE buffer → parsed events | `src/lib/parse-sse.ts` | DONE |

### 1-2. テストファイルと仕様

#### `src/__tests__/lib/find-duplicate.test.ts`

```
findDuplicateIndex(articles, article)
  - URL が一致する記事があれば、そのインデックスを返す
  - URL なしでも title が一致すればインデックスを返す
  - 一致なしなら -1
  - 空配列なら -1
  - URL 一致を title 一致より優先（URL が先に見つかる）
```

#### `src/__tests__/lib/multi-model-analysis.test.ts`

```
computeMultiModelAnalysis(results)
  - 1モデルの場合: consensus = そのモデルのスコア、variance = 全軸0
  - 2モデルの場合: consensus = 平均、variance = 正しい分散値
  - 3モデルで経済軸のみ大きく乖離 → maxDivergenceAxis = "経済軸"
  - 社会軸が最大乖離 → maxDivergenceAxis = "社会軸"
  - 外交軸が最大乖離 → maxDivergenceAxis = "外交安保軸"
  - 全軸同じ分散 → maxDivergenceAxis は3つのうちいずれか（reduce の挙動で economic）
```

#### `src/__tests__/lib/format-time.test.ts`

```
formatRelative(dateStr)
  ※ 現在4箇所に微妙に異なる実装がある。統一後にテスト。
  - 60秒未満 → "今" or "N秒前" （統一仕様を決める。"今" を推奨）
  - 1分〜59分 → "N分前"
  - 1時間〜23時間 → "N時間前"
  - 24時間以上 → "N日前"
  - 未来の日付 → "今"（Date.now() - future < 0 → mins < 1）

formatDateTime(iso)
  - "2025-01-15T10:30:00Z" → "2025/01/15 19:30"（JST ロケール依存。vi.stubGlobal で固定）
```

#### `src/__tests__/lib/sort-groups.test.ts`

```
sortGroups(groups)
  - singleOutlet=true のグループは末尾
  - 同条件ならユニークソース数の多い順
  - ソース数も同じなら記事数の多い順
  - 空配列 → 空配列
  - items が undefined の場合のハンドリング
```

#### `src/__tests__/lib/media-matcher.test.ts`

```
MEDIA マッチング
  - "NHKニュース" → NHK にマッチ
  - "朝日新聞デジタル" → 朝日にマッチ
  - "日経ビジネス" → 日経にマッチ（startsWith("日経") || === "日本経済新聞"）
  - "東洋経済ONLINE" → 東洋にマッチ（includes("東洋経済")）
  - "ハフポスト日本版" → ハフポストにマッチ
  - マッチしないソース → どの MEDIA にも該当しない

countArticles(group, media)
  - group.items 内のマッチ記事数を返す
  - items が空 → 0
  - items が undefined → 0
```

#### `src/__tests__/lib/dedup-feed-items.test.ts`

```
dedupAndSortFeedItems(items)
  - 同一URLの記事を重複排除
  - url が空/null の記事は除外
  - publishedAt の降順ソート（新しい順）
  - publishedAt がない記事は末尾
  - 入力が空配列 → 空配列
```

#### `src/__tests__/lib/parse-sse.test.ts`

```
parseSSEBuffer(buffer)
  ※ 全ページで繰り返される SSE パースパターンを共通化
  - "event: model-result\ndata: {...}\n\n" → [{event: "model-result", data: {...}}]
  - 不完全なバッファ → 残りを返す
  - data 行のみ（event なし）→ 正しくパース
  - JSON パースエラー → スキップ
  - 複数イベントが1チャンクに入る場合
```

#### `src/__tests__/lib/youtube-channel-configs.test.ts`

```
（feed-configs.test.ts と同パターン）
  - 1件以上のチャンネルが定義されている
  - 全チャンネルが必須フィールドを持つ (id, name, channelId, category)
  - id が重複していない
  - channelId が UC で始まる
  - category が "mainstream" | "independent" | "commentary" のいずれか
  - DEFAULT_ENABLED_CHANNEL_IDS が ALL_YOUTUBE_CHANNELS に存在する id のみ含む
  - defaultEnabled=true のチャンネルと DEFAULT_ENABLED_CHANNEL_IDS が一致
```

#### `src/__tests__/lib/feed-settings.test.ts`

```
loadFeedSettings()
  - localStorage が空 → デフォルト値を返す
  - localStorage に valid JSON → パースして返す
  - localStorage に壊れた JSON → デフォルト値を返す
  - enabledIds が配列でない → デフォルト値にフォールバック
  - window が undefined（SSR） → デフォルト値

saveFeedSettings(settings)
  - localStorage に JSON を書き込む
  - window が undefined → 何もしない（エラーにならない）
```

> ⚠ localStorage のモックが必要。vitest では `vi.stubGlobal('localStorage', ...)` を使用。

---

## 2. E2E テスト — Playwright

### 2-1. セットアップ

```bash
npm install -D @playwright/test
npx playwright install chromium
```

`playwright.config.ts`:
```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  retries: 1,
  use: {
    baseURL: "http://localhost:3000",
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
  },
  webServer: {
    command: "npm run dev",
    port: 3000,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
```

`package.json` に追加:
```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui"
  }
}
```

### 2-2. API Mock 戦略

全ページが `API_BASE + /api/...` を fetch するため、Playwright の **Route interception** で mock する。

```ts
// e2e/fixtures/api-mock.ts
import { Page } from "@playwright/test";

export async function mockAPI(page: Page) {
  // /api/rss
  await page.route("**/api/rss*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: RSS_FIXTURE }),
    })
  );

  // /api/batch/latest
  await page.route("**/api/batch/latest", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(BATCH_LATEST_FIXTURE),
    })
  );

  // /api/feed-groups
  await page.route("**/api/feed-groups", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(FEED_GROUPS_FIXTURE),
    })
  );

  // /api/compare*
  await page.route("**/api/compare?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(COMPARE_FIXTURE),
    })
  );

  // SSE エンドポイント（/api/analyze, /api/compare/analyze, /api/youtube/analyze）
  // → route.fulfill で text/event-stream を返す
}
```

### 2-3. Fixture ファイル

`e2e/fixtures/data.ts` に型安全なテストデータを配置:

```ts
import type { RssFeedItem, NewsGroup, SnapshotMeta } from "@/types";

export const RSS_FIXTURE: RssFeedItem[] = [
  {
    title: "テスト記事1: 防衛費増額を閣議決定",
    url: "https://example.com/article-1",
    source: "NHKニュース",
    publishedAt: new Date().toISOString(),
    category: "politics",
  },
  {
    title: "テスト記事2: 日経平均が4万円突破",
    url: "https://example.com/article-2",
    source: "日本経済新聞",
    publishedAt: new Date().toISOString(),
    category: "economy",
  },
  // ... 5件程度
];

export const BATCH_LATEST_FIXTURE = {
  snapshot: {
    id: "snap-001",
    processedAt: new Date().toISOString(),
    articleCount: 120,
    groupCount: 15,
    durationMs: 3500,
    status: "success",
    error: null,
  } satisfies SnapshotMeta,
  groups: [
    {
      groupTitle: "防衛費増額の閣議決定",
      items: [
        { title: "防衛費増額決定", url: "https://example.com/1", source: "NHKニュース", publishedAt: new Date().toISOString() },
        { title: "防衛費が過去最大に", url: "https://example.com/2", source: "朝日新聞デジタル", publishedAt: new Date().toISOString() },
        { title: "防衛費増額、野党反発", url: "https://example.com/3", source: "毎日新聞", publishedAt: new Date().toISOString() },
      ],
      singleOutlet: false,
      category: "politics",
    },
    // ... 3-5グループ
  ] satisfies NewsGroup[],
};
```

### 2-4. テストシナリオ

#### `e2e/home.spec.ts` — ホームページ

```
ホームページ
  ✅ ページが表示される（ヘッダー "NewsPrism" が見える）
  ✅ ナビゲーションリンクが存在する（まとめ、YouTube、メディア比較）
  ✅ RSSフィードが読み込まれ記事カードが表示される
  ✅ URL入力フォームが存在し、空の場合は分析ボタンが disabled
  ✅ フィード設定ドロワーが開閉する（⚙ボタン → ESCで閉じる）
  ✅ 記事カードの「3軸分析」ボタンをクリック → ローディング表示 → 分析結果パネルが開く
  ✅ 分析結果パネルにスコアカードが表示される
```

#### `e2e/ranking.spec.ts` — ランキング（まとめ）ページ

```
ランキングページ
  ✅ /ranking にアクセスするとスナップショット情報が表示される
  ✅ CoverageMatrix（報道カバレッジマトリクス）が表示される
  ✅ マトリクスの行をクリック → オーバーレイで記事一覧が表示される
  ✅ オーバーレイの「✕」で閉じる
  ✅ 「更新」ボタンクリック → 再読み込みされる
  ✅ スナップショットなし → 「スナップショットがありません」メッセージ
  ✅ API エラー時 → エラーメッセージ表示
```

#### `e2e/compare.spec.ts` — メディア比較ページ

```
メディア比較ページ
  ✅ /compare にアクセスすると検索バーとサジェストキーワードが表示される
  ✅ サジェストキーワードをクリック → 検索が実行される
  ✅ 検索結果としてニュースグループカードが表示される
  ✅ グループカードをクリック → 分析進捗画面 → 結果表示
  ✅ 「リセット」ボタンで初期状態に戻る
  ✅ 検索結果0件 → エラーメッセージ表示
  ✅ ?q= パラメータ付きでアクセス → 自動検索される
```

#### `e2e/youtube.spec.ts` — YouTube分析ページ

```
YouTube分析ページ
  ✅ /youtube にアクセスするとチャンネル選択UIが表示される
  ✅ チャンネル選択 → 「最新動画を取得」→ 動画一覧表示
  ✅ 「全動画を分析」→ 進捗表示 → 結果（PositioningPlot + ScoreCard）
  ✅ 「リセット」ボタンで初期状態に戻る
  ✅ チャンネル未選択時は取得ボタンが disabled
```

#### `e2e/inspect.spec.ts` — 点検ページ

```
点検ページ
  ✅ /inspect にアクセスすると FeedGroups タブが表示される
  ✅ タブ切り替え（FeedGroups ↔ Snapshot）
  ✅ FeedGroups: グループをクリック → 記事リスト展開
  ✅ Snapshot: グループをクリック → inspect detail 読み込み・展開
  ✅ 「再計算診断を実行」ボタン → 結果が表示される
  ✅ API エラー時 → エラーメッセージ表示
```

#### `e2e/navigation.spec.ts` — ページ間遷移

```
ナビゲーション
  ✅ ホーム → まとめ → ホーム（ブラウザバック）
  ✅ ホーム → メディア比較 → ホーム
  ✅ ホーム → YouTube → ホーム
  ✅ まとめ → メディア比較（ヘッダーリンク）
  ✅ 点検ページ → 各ページ（ヘッダーリンク）
```

### 2-5. SSE mock の実装例

```ts
// e2e/fixtures/sse-mock.ts
import { Route } from "@playwright/test";

export function fulfillSSE(route: Route, events: Array<{ event: string; data: object }>) {
  const body = events
    .map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n`)
    .join("\n");

  return route.fulfill({
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
    body,
  });
}
```

---

## 3. 実装順序

```
Phase 1 — ユニットテスト基盤 + P0（1日目）
  1. 関数を src/lib/ に抽出（find-duplicate, multi-model-analysis, format-time, sort-groups, media-matcher）
  2. 各テストファイル作成・通過確認
  3. 既存の import を抽出先に切り替え（page.tsx / component から import { xxx } from "@/lib/xxx"）

Phase 2 — ユニットテスト P1（1日目後半）
  4. dedup-feed-items 抽出 + テスト
  5. feed-settings テスト（localStorage mock）
  6. youtube-channel-configs テスト
  7. parse-sse 抽出 + テスト

Phase 3 — E2E 基盤（2日目）
  8. Playwright 導入 + playwright.config.ts
  9. API mock fixture 作成（e2e/fixtures/）
  10. SSE mock ヘルパー作成

Phase 4 — E2E シナリオ（2日目後半〜3日目）
  11. navigation.spec.ts
  12. home.spec.ts
  13. ranking.spec.ts
  14. compare.spec.ts
  15. youtube.spec.ts
  16. inspect.spec.ts
```

---

## 4. ディレクトリ構成（完成形）

```
src/
  lib/
    find-duplicate.ts          ← NEW
    multi-model-analysis.ts    ← NEW
    format-time.ts             ← NEW
    sort-groups.ts             ← NEW
    media-matcher.ts           ← NEW
    dedup-feed-items.ts        ← NEW
    parse-sse.ts               ← NEW
    ...（既存）
  __tests__/
    lib/
      find-duplicate.test.ts       ← NEW
      multi-model-analysis.test.ts ← NEW
      format-time.test.ts          ← NEW
      sort-groups.test.ts          ← NEW
      media-matcher.test.ts        ← NEW
      dedup-feed-items.test.ts     ← NEW
      parse-sse.test.ts            ← NEW
      feed-settings.test.ts        ← NEW
      youtube-channel-configs.test.ts ← NEW
      ...（既存）
e2e/
  fixtures/
    data.ts                    ← テストデータ
    api-mock.ts                ← route interception
    sse-mock.ts                ← SSE mock ヘルパー
  home.spec.ts
  ranking.spec.ts
  compare.spec.ts
  youtube.spec.ts
  inspect.spec.ts
  navigation.spec.ts
playwright.config.ts           ← NEW
```

---

## 5. 注意事項

- **formatRelative が4箇所で微妙に異なる実装**（秒表示 vs "今"、閾値の違い）→ 統一してから抽出
- **MEDIA 定数は CoverageMatrix.tsx にハードコード**されている → `src/lib/media-matcher.ts` に移動
- **localStorage テスト**は `vi.stubGlobal` で mock。テスト後の cleanup を忘れない
- **E2E の SSE mock** は `route.fulfill` で即時レスポンスを返す（ストリーミング再現は不要、最終結果だけ返せばOK）
- **Playwright の `webServer`** は `reuseExistingServer: true` にして、dev サーバー起動済みなら再利用
