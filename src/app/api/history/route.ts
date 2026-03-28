import { getRecentArticles, getRecentCompareSessions } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") ?? "articles";

    if (type === "compare") {
      const sessions = await getRecentCompareSessions(20);
      return Response.json({ sessions });
    }

    const articles = await getRecentArticles(30);
    return Response.json({ articles });
  } catch (error) {
    const message = error instanceof Error ? error.message : "履歴の取得に失敗しました";
    console.error("[history] エラー:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
