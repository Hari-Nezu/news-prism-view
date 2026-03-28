import { fetchAllDefaultFeeds } from "@/lib/rss-parser";
import { groupArticlesByEvent } from "@/lib/news-grouper";
import { saveCompareSession, saveNewsGroupRecords } from "@/lib/db";
import { embedNewsGroup } from "@/lib/embeddings";
import { filterByKeyword } from "@/lib/compare-filter";
import { z } from "zod";

const QuerySchema = z.object({
  keyword: z.string().min(1).max(300),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { keyword } = QuerySchema.parse({
      keyword: searchParams.get("keyword") ?? "",
    });

    const allItems = await fetchAllDefaultFeeds();
    const matched  = filterByKeyword(allItems, keyword);

    if (matched.length === 0) {
      return Response.json({ groups: [], keyword, totalFetched: allItems.length });
    }

    const groups = await groupArticlesByEvent(matched);

    // DB保存 → グループ埋め込み生成・保存（レスポンスをブロックしない）
    saveCompareSession(keyword, groups)
      .then(async (sessionId) => {
        const embedResults = await Promise.all(
          groups.map(async (g, i) => ({ i, vec: await embedNewsGroup(g) }))
        );
        const embeddings: Record<number, number[]> = {};
        for (const { i, vec } of embedResults) {
          if (vec) embeddings[i] = vec;
        }
        await saveNewsGroupRecords(sessionId, groups, embeddings);
      })
      .catch((err) => console.error("[compare] グループ保存エラー:", err));

    return Response.json({ groups, keyword, totalFetched: allItems.length, matchedCount: matched.length });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "キーワードを入力してください" }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "不明なエラー";
    console.error("[compare] エラー:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
