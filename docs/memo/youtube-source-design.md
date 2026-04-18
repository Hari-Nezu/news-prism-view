# YouTube ソース分析機能 — 【DONE】

既存のRSSパイプライン（取得→グループ化→3軸分析）を再利用し、
YouTubeチャンネルの動画を **字幕（トランスクリプト）テキスト** ベースで政治ポジショニング分析する機能が実装済みです。

既存のRSS/記事分析とは **別画面** として提供する。

## 2. データ取得方式

| ステップ | 方法 | APIキー |
|---|---|---|
| 動画一覧 | YouTube RSS (`/feeds/videos.xml?channel_id=XXX`) | 不要 |
| 字幕取得 | `youtube-transcript` パッケージ（Innertube API経由） | 不要 |

- YouTube RSS は最新15件を返す（ニュース分析には十分）
- 字幕取得は **分析時にオンデマンド**（一覧表示時は不要）
- 字幕なし動画は `description`（RSS内の概要）をフォールバック
- `analyzeArticle()` 内部で3000文字に切り詰め済み

### 法的考慮

- YouTube ToS は自動スクレイピングを禁止している
- `youtube-transcript` は Innertube API（YouTube内部API）を使用しており、HTML スクレイピングではない
- 本ツールはローカル個人利用限定。字幕の再配布はしない
- **レートリミット**: チャンネルあたり最大10本、リクエスト間隔1秒以上

## 3. 新規ファイル構成

```
src/
├── lib/
│   ├── youtube-channel-configs.ts   # チャンネル設定データ
│   └── youtube-feed.ts              # YouTube RSS取得 + 字幕取得
├── components/
│   ├── YouTubeChannelPanel.tsx      # チャンネル選択UI（カテゴリ別チェックボックス）
│   └── YouTubeVideoCard.tsx         # 動画カード（サムネイル + 分析結果）
└── app/
    ├── youtube/page.tsx             # YouTube分析ページ
    └── api/youtube/
        ├── feed/route.ts            # GET: チャンネルフィード取得
        └── analyze/route.ts         # POST: 字幕→分析（SSE）
```

## 4. DB スキーマ追加

`prisma/schema.prisma` に追加:

```prisma
model YouTubeVideo {
  id             String   @id @default(cuid())
  videoId        String   @unique       // YouTube video ID (11文字)
  title          String
  channelName    String
  channelId      String                 // YouTube channel ID (UC...)
  description    String?
  thumbnailUrl   String?
  publishedAt    String?
  transcript     String                 // 字幕テキスト全文（切り詰め済み）
  analyzedAt     DateTime @default(now())

  // 3軸スコア（Article と同じ構造）
  economic       Float
  social         Float
  diplomatic     Float
  emotionalTone  Float
  biasWarning    Boolean
  confidence     Float
  summary        String
  counterOpinion String

  topic          String?

  embedding      Unsupported("vector(768)")?

  @@index([channelId])
  @@index([analyzedAt(sort: Desc)])
}
```

**設計判断**: `Article` テーブルとは別テーブルにする。
- YouTube 固有フィールド（`videoId`, `channelId`, `transcript`）が多い
- チャンネル別集計クエリが容易
- 既存の Article パイプラインに影響しない

## 5. チャンネル設定

`src/lib/youtube-channel-configs.ts`:

```typescript
export interface YouTubeChannelConfig {
  id: string;                  // 内部ID ("nikkei-teleto", "tbsnews" 等)
  name: string;                // 表示名
  channelId: string;           // YouTube channel ID (UC...)
  category: "mainstream" | "independent" | "commentary";
  leaningHint?: string;        // 参考: "保守系", "リベラル系", "中立" 等
  defaultEnabled: boolean;
  maxVideos: number;           // 取得する最新動画数（デフォルト5）
}
```

### 初期チャンネル案

| カテゴリ | チャンネル | 備考 |
|---|---|---|
| **mainstream** | 日経テレ東大学 | 経済・ビジネス寄り |
| mainstream | TBS NEWS DIG | 地上波ニュース |
| mainstream | ANNnewsCH | テレ朝系 |
| **independent** | ReHacQ | ひろゆき・成田悠輔等 |
| independent | Choose Life Project | 社会問題系 |
| independent | 文化人放送局 | 保守系 |
| **commentary** | PIVOT | ビジネス・テック |
| commentary | 高橋洋一チャンネル | 経済・保守系 |
| commentary | 一月万冊 | リベラル系 |

※ チャンネルIDは実装時に調査して埋める。将来的にUIから追加可能にする余地を残す。

## 6. 処理フロー

### フェーズ1: フィード取得

```
ユーザーがチャンネルを選択
  → GET /api/youtube/feed?channels=id1,id2,...
  → 各チャンネルの YouTube RSS を rss-parser でパース
  → RssFeedItem[] 互換の配列に変換して返却
```

### フェーズ2: グループ化（オプション）

```
取得した動画一覧を既存の groupArticlesByEvent() に渡す
  → 同一ニュースを扱う動画をグループ化
  → NewsGroup[] を返す
```

既存の `news-grouper.ts` がそのまま使える（`RssFeedItem[]` 互換にすれば動く）。

### フェーズ3: 分析（SSE）

```
ユーザーがグループ or 個別動画を選択
  → POST /api/youtube/analyze { items: [...] }
  → 各動画について:
    1. youtube-transcript で字幕取得（1秒間隔）
    2. 字幕テキストを content として analyzeArticle(title, transcript) に渡す
    3. SSE で結果をストリーム
    4. DB保存（YouTubeVideo テーブル）
```

## 7. `src/lib/youtube-feed.ts` の公開API

```typescript
/** YouTube RSS からチャンネルの最新動画を取得 */
export async function fetchYouTubeChannelFeed(
  config: YouTubeChannelConfig
): Promise<RssFeedItem[]>

/** 複数チャンネルをまとめて取得 */
export async function fetchAllYouTubeFeeds(
  enabledIds?: string[]
): Promise<RssFeedItem[]>

/** 動画IDから字幕テキストを取得（日本語優先、fallback で自動生成字幕） */
export async function fetchTranscript(
  videoId: string
): Promise<string | null>

/** YouTube URL から videoId を抽出 */
export function extractVideoId(url: string): string | null
```

`fetchYouTubeChannelFeed` は既存の `fetchRssFeed` と同じく `RssFeedItem[]` を返す。
これにより `groupArticlesByEvent()` や `filterByKeyword()` がそのまま適用可能。

## 8. UIページ設計

`src/app/youtube/page.tsx` — 既存 `compare/page.tsx` のステートマシンパターンを踏襲:

```typescript
type YouTubeStep =
  | { type: "idle" }
  | { type: "fetching" }
  | { type: "grouping" }
  | { type: "grouped"; groups: NewsGroup[] }
  | { type: "analyzing"; group: NewsGroup; progress: number; total: number }
  | { type: "done"; group: NewsGroup; results: AnalyzedArticle[] }
  | { type: "error"; message: string };
```

### ページ構成

1. **ヘッダー**: 「← ホーム」リンク + タイトル「YouTube ニュース分析」
2. **チャンネル選択パネル**: カテゴリ別チェックボックス（mainstream / independent / commentary）
3. **取得ボタン** → 動画一覧表示
4. **グループ表示** → 分析選択
5. **分析結果表示**: 既存の ScoreCard + PositioningPlot を再利用

## 9. 再利用する既存モジュール

| モジュール | 用途 |
|---|---|
| `ollama.ts` | `analyzeArticle()` — 字幕をcontentに渡す |
| `embeddings.ts` | ベクトル化（類似検索用） |
| `news-grouper.ts` | 動画のグループ化 |
| `topic-classifier.ts` | トピック分類 |
| `rss-parser` パッケージ | YouTube RSS もパース可能 |
| `ScoreCard.tsx` | 分析結果表示 |
| `PositioningPlot.tsx` | 2Dプロット |
| `NewsGroupCard.tsx` | グループ選択UI |

## 10. 依存パッケージ追加

```bash
npm install youtube-transcript
```

追加は1パッケージのみ。`rss-parser` は既存。

## 11. 実装順序

| # | 内容 | 依存 |
|---|---|---|
| 1 | `npm install youtube-transcript` | なし |
| 2 | `youtube-channel-configs.ts` 作成 | なし |
| 3 | `youtube-feed.ts` 作成（RSS取得 + 字幕取得） | 1, 2 |
| 4 | Prisma スキーマに `YouTubeVideo` 追加 + `prisma db push` | なし |
| 5 | `db.ts` に YouTube 動画保存関数を追加 | 4 |
| 6 | `api/youtube/feed/route.ts` 作成 | 3 |
| 7 | `api/youtube/analyze/route.ts` 作成（SSE） | 3, 5 |
| 8 | `YouTubeChannelPanel.tsx` 作成 | 2 |
| 9 | `YouTubeVideoCard.tsx` 作成 | なし |
| 10 | `youtube/page.tsx` 作成 | 6, 7, 8, 9 |
| 11 | ナビゲーションリンク追加（`page.tsx`, `compare/page.tsx`） | 10 |

## 12. 潜在的な課題と対策

| 課題 | 対策 |
|---|---|
| 字幕がない動画 | `description` をフォールバック。`confidence` を低く設定し、UIに「字幕なし」表示 |
| 字幕取得ライブラリの不安定性 | try/catch で囲みスキップ。将来的に `@playzone/youtube-transcript` へのフォールバック |
| レートリミット | チャンネルあたり最大10本、リクエスト間隔1秒の delay |
| 長時間動画の字幕量 | `analyzeArticle()` 内部で3000文字に切り詰め済み |
| YouTube ToS | ローカル個人利用限定。字幕再配布なし |
| チャンネルID変更 | 設定ファイルで管理、UIから将来的に編集可能に |

## 13. 将来の拡張候補

- UIからのチャンネル追加・管理機能
- チャンネル別ポジショニング推移グラフ（D3.js 時系列）
- YouTube Data API v3 への切り替え（APIキー設定時に有効化）
- 動画コメントの感情分析
- RSS記事 × YouTube動画のクロスソース比較
