package steps

import (
	"fmt"

	"github.com/newsprism/shared/taxonomy"
)

// classifySystemPrompt is the system prompt for LLM-based article classification.
var classifySystemPrompt = fmt.Sprintf(`あなたはニュース分類の専門家です。
与えられたニュース記事を以下の分類基準に基づいて正確に分類してください。

%s

## ルール
- 必ずJSON形式のみで回答する（説明文不要）
- category と subcategory は英語IDを使用する
- confidence は 0.0〜1.0 で回答する`, taxonomy.BuildClassificationGuide())

// refineSystemPrompt is the system prompt for LLM-based cluster critique.
const refineSystemPrompt = `あなたはニュースクラスタの品質審査員です。各クラスタについて以下を判定してください。

判定種別:
- coherent: クラスタ内の記事がすべて同一のニューストピックを報じている
- split: クラスタ内に明らかに異なるトピックの記事が混在している（outlier_indicesに該当記事の番号[N]を列挙）
- merge: このクラスタは隣接クラスタと実質的に同じトピックを扱っている（target_idxに統合先クラスタ番号を指定）
- move: 特定の記事が別クラスタに属すべきである（outlier_indicesに記事番号[N]、target_idxに移動先クラスタ番号を指定）

注意:
- 1記事のみのクラスタは coherent と判定する
- merge/moveのtarget_idxは「隣接クラスタ」に存在するクラスタ番号のみ指定する
- 批評対象クラスタをすべて評価し、評価漏れを作らない

必ずJSON形式のみで回答してください。
出力フォーマット: { "critiques": [{ "cluster_idx": 0, "verdict": "coherent", "reason": "理由" }, ...] }
split/moveの例: { "cluster_idx": 2, "verdict": "split", "reason": "...", "outlier_indices": [1, 3] }`

// consensusSystemPrompt is the system prompt for per-fact media coverage extraction.
const consensusSystemPrompt = `あなたはニュース分析の専門家です。同一トピックを複数の日本メディアが報じたグループを分析し、各報道ポイントをどのメディアが伝えているかを抽出してください。

手順:
1. グループ内の記事から、このニュースイベントの報道ポイント（事実・主張・論点）を洗い出す
2. 各ポイントについて、そのポイントを報じている媒体名を列挙する（記事中に根拠があるものだけ）
3. ポイントは「報じているメディア数が多い順」に並べる

注意:
- 1つのポイントは1〜2文の簡潔な事実・主張で記述する
- sources には当該グループに登場する媒体名のみ使用する（推測・補完禁止）
- ポイント数は 3〜8 程度を目安とする

必ずJSON形式のみで回答してください。
出力フォーマット:
{
  "groups": [
    {
      "index": 0,
      "points": [
        {"fact": "事実A", "sources": ["NHK", "読売新聞", "朝日新聞"]},
        {"fact": "事実B", "sources": ["日本経済新聞"]},
        {"fact": "事実C", "sources": ["産経新聞", "朝日新聞"]}
      ]
    }
  ]
}`

// nameSystemPrompt is the system prompt for LLM-based cluster title generation.
const nameSystemPrompt = `各グループの「全記事」が共通して報じている出来事を、20字以内の自然な日本語で命名してください。

命名スタイル:
- 体言止め（名詞句）を基本とする。例:「日銀の利上げ決定」「トランプ関税と円安」
- 述語（〜した・〜される）で終わらせない
- 固有名詞（人名・地名・組織名）は積極的に使う

制約:
- グループ内の一部の記事にしか当てはまらない内容は含めない

必ずJSON形式のみで回答してください。
出力フォーマット: { "groups": [{ "index": 0, "title": "タイトル" }, ...] }`
