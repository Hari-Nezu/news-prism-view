import { z } from "zod";
import type { RssFeedItem, NewsGroup } from "@/types";

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3.2";

const GroupSchema = z.object({
  groups: z.array(
    z.object({
      group_title: z.string(),
      indices: z.array(z.number().int()),
    })
  ),
});

const SYSTEM_PROMPT = `あなたはニュース記事の分類専門家です。
与えられた記事タイトルのリストを「同一ニュースイベント」ごとにグループ化してください。

## ルール
- 同じ出来事・政策・事件を報じている記事を同一グループにまとめる
- 関連はあるが別の出来事（例: 同じ政策の異なる局面）は別グループにする
- グループ名は20字以内の簡潔な日本語で命名する
- 必ずJSON形式のみで回答する（説明文不要）

## 出力フォーマット
{
  "groups": [
    { "group_title": "グループ名", "indices": [0, 2, 4] },
    { "group_title": "別のグループ名", "indices": [1, 3] }
  ]
}`;

/**
 * 複数記事をOllamaで同一ニュースごとにグループ化する
 * @returns グループ配列（複数媒体のグループが先頭に来るようソート済み）
 */
export async function groupArticlesByEvent(
  items: RssFeedItem[]
): Promise<NewsGroup[]> {
  if (items.length === 0) return [];

  // 10件以下なら全件送信、多い場合は先頭30件に絞る
  const targets = items.slice(0, 30);

  const articleList = targets
    .map((item, i) => `${i}: 「${item.title}」- ${item.source}`)
    .join("\n");

  const prompt = `以下の${targets.length}件の記事を同一ニュースごとにグループ化してください。\n\n${articleList}`;

  const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      system: SYSTEM_PROMPT,
      prompt,
      stream: false,
      format: "json",
      options: { temperature: 0.1 },
    }),
  });

  if (!response.ok) {
    throw new Error(`グループ化APIエラー: ${response.status}`);
  }

  const data = await response.json();
  const raw = JSON.parse(data.response);
  const parsed = GroupSchema.parse(raw);

  // インデックスから RssFeedItem に変換
  const groups: NewsGroup[] = parsed.groups
    .map(({ group_title, indices }) => {
      const validIndices = indices.filter((i) => i >= 0 && i < targets.length);
      const groupItems = validIndices.map((i) => targets[i]);
      const uniqueSources = new Set(groupItems.map((item) => item.source));
      return {
        groupTitle: group_title,
        items: groupItems,
        singleOutlet: uniqueSources.size <= 1,
      };
    })
    .filter((g) => g.items.length > 0);

  // 複数媒体のグループを先頭に表示
  groups.sort((a, b) => {
    if (a.singleOutlet !== b.singleOutlet) return a.singleOutlet ? 1 : -1;
    return b.items.length - a.items.length;
  });

  return groups;
}
