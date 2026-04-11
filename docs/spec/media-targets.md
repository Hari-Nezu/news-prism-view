# 日本大手メディア バイアス可視化 対象一覧 仕様

## 現状

バイアス可視化やカバレッジ表示で前提にしている主要媒体は **15社**。  
定義はフロント側では `src/lib/config/feed-configs.ts`、バッチ側では `batch/feeds.yaml` にある。

現在のバッチは、収集後に **この主要媒体として定義された `source` のみ** を保存する。  
`Google News 政治` のような総称 source や、未定義媒体は保存対象外。

---

## 対象媒体 15社

| ID | 媒体名 | 取得方式 |
|---|---|---|
| `nhk` | NHK | 直接RSS |
| `asahi` | 朝日新聞 | 直接RSS |
| `mainichi` | 毎日新聞 | 直接RSS |
| `sankei` | 産経新聞 | 直接RSS |
| `toyokeizai` | 東洋経済オンライン | 直接RSS |
| `huffpost-jp` | ハフポスト日本版 | 直接RSS |
| `yomiuri` | 読売新聞 | Google News site検索 + `canonical_source` |
| `nikkei` | 日本経済新聞 | Google News site検索 + `canonical_source` |
| `tokyo-np` | 東京新聞 | Google News site検索 + `canonical_source` |
| `jiji` | 時事通信 | Google News site検索 + `canonical_source` |
| `kyodo` | 共同通信 | Google News site検索 + `canonical_source` |
| `tbs-news` | TBSニュース | Google News site検索 + `canonical_source` |
| `tv-asahi` | テレビ朝日 | Google News site検索 + `canonical_source` |
| `ntv` | 日本テレビ | Google News site検索 + `canonical_source` |
| `fnn` | フジテレビ | Google News site検索 + `canonical_source` |

補足:
- `nhk-politics` などの NHK サブフィードは存在するが、デフォルト収集対象ではない
- `gnews-politics` / `gnews-economy` / `gnews-world` は定義だけあり、`defaultEnabled: false`

---

## 実装済みの挙動

### フロント
- カバレッジマトリクスは `src/components/CoverageMatrix.tsx` で 15 社前提の列定義を持つ
- `coveredBy` / `silentMedia` は snapshot 側の保存値を使う

### バッチ
- Google News source の媒体名抽出
- `canonical_source` による表記揺れ吸収
- 主要媒体以外の source を収集段階で破棄
