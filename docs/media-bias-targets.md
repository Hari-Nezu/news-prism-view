# 日本大手メディア バイアス可視化 対象一覧

## 設計方針

- **報道バイアス**: 同一トピックをどの媒体がどう報じたか（3軸スコアの分布）
- **沈黙バイアス**: 同一トピックを報じた媒体 vs 報じなかった媒体の可視化
- 単位は「グループ（同一イベントのクラスタ）」。グループに参加した媒体を集計する。

---

## 対象メディア 15社

政治的立ち位置は事前に付与しない。各記事の3軸スコア（economic/social/diplomatic）を集計した結果として導出する。

| # | ID | 媒体名 | RSS URL | 備考 |
|---|-----|--------|---------|------|
| 1 | `nhk` | NHK | `https://www.nhk.or.jp/rss/news/cat4.xml` (政治) | 複数カテゴリあり |
| 2 | `asahi` | 朝日新聞 | `https://www.asahi.com/rss/asahi/newsheadlines.rdf` | 既存 |
| 3 | `mainichi` | 毎日新聞 | `https://mainichi.jp/rss/etc/mainichi-flash.rss` | 要検証 |
| 4 | `yomiuri` | 読売新聞 | Google News source経由 | RSS非公開の可能性 |
| 5 | `nikkei` | 日本経済新聞 | Google News source経由 | 有料記事が多い |
| 6 | `sankei` | 産経新聞 | `https://www.sankei.com/rss/news/flash.xml` | 既存 |
| 7 | `tokyo-np` | 東京新聞 | `https://www.tokyo-np.co.jp/rss/news/politics.xml` | 要検証 |
| 8 | `jiji` | 時事通信 | `https://www.jiji.com/rss/ranking.rss` | 要検証 |
| 9 | `kyodo` | 共同通信 | Google News source経由 | RSS非公開 |
| 10 | `tbs-news` | TBSニュース | `https://news.tbs.co.jp/rss/news_politics.rdf` | 要検証 |
| 11 | `tv-asahi` | テレビ朝日（ANN） | `https://news.tv-asahi.co.jp/rss/index.rss` | 要検証 |
| 12 | `ntv` | 日本テレビ（NNN） | Google News source経由 | RSS要調査 |
| 13 | `fnn` | フジテレビ（FNN） | Google News source経由 | RSS要調査 |
| 14 | `toyokeizai` | 東洋経済オンライン | `https://toyokeizai.net/list/feed/rss` | 既存 |
| 15 | `huffpost-jp` | ハフポスト日本版 | `https://www.huffingtonpost.jp/feeds/index.xml` | 既存 |

---

## RSS取得戦略

### A. 直接RSSあり（7社）
NHK、朝日、毎日、産経、東京新聞、時事、TBS、テレビ朝日、東洋経済、ハフポスト

### B. Google News `<source>` タグで識別（残り）
読売・日経・共同・日テレ・フジは Google News RSS の `<source>` に媒体名が入る。
現在の Google News フィードを拡張し `source` フィールドをそのまま媒体 ID に使用。

---

## バイアス可視化の指標

### 1. カバレッジマトリクス（沈黙バイアス）
- 縦軸: トピックグループ（同一イベント）
- 横軸: 媒体15社
- セル: ○（報じた）/ ×（報じなかった）
- 「×」の多い媒体・トピックの組み合わせが「沈黙バイアス」

### 2. 同一トピック内の論調比較
- 同一グループを報じた複数媒体の `economic/social/diplomatic` スコアを並べる
- 「同じ出来事をどう切り取ったか」の差分が可視化される

### 3. 媒体スタンス傾向（記事集積から導出）
- 各媒体が報じた記事の3軸スコアを累積平均
- 事前評価ではなく**実績データから**媒体の傾向を導出
- 媒体ごとの傾向マップとして2D散布図で表示（例: economic軸 × diplomatic軸）

---

## 実装フェーズ

### Phase 1: フィード拡張
- `feed-configs.ts` に対象15社の RSS を追加（`source` フィールドで媒体を正規化）
- Google News 経由の媒体は `type: "google-news"` で `<source>` を媒体名として使用

### Phase 2: 媒体メタデータ
- `media-registry.ts` に15社の ID・名称・立ち位置情報を定義
- グループ内の `singleOutlet` フラグを拡張し、参加媒体リストを保持

### Phase 3: カバレッジ集計 API
- `/api/coverage` : トピックグループ × 媒体のマトリクスを返す
- グループに参加していない媒体を「沈黙」として記録

### Phase 4: UI
- カバレッジマトリクス表示コンポーネント
- 媒体別スコア分布チャート

---

## 注意事項

- 政治的立ち位置は「一般的に言われている傾向」であり確定的評価ではない
- RSS更新頻度・記事量は媒体によって大きく異なる（正規化が必要）
- NHK・通信社（時事・共同）は一次ソースとして他媒体に引用されるため扱いが特殊
- 有料記事（日経等）はタイトルのみで全文分析不可
