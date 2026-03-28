import { fetchAllDefaultFeeds, fetchRssFeed } from "@/lib/rss-parser";
import { z } from "zod";

const QuerySchema = z.object({
  feedUrl:    z.string().url().optional(),
  feedName:   z.string().optional(),
  enabledIds: z.string().optional(), // カンマ区切りのフィード ID
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { feedUrl, feedName, enabledIds } = QuerySchema.parse({
      feedUrl:    searchParams.get("feedUrl")    ?? undefined,
      feedName:   searchParams.get("feedName")   ?? undefined,
      enabledIds: searchParams.get("enabledIds") ?? undefined,
    });

    let items;
    if (feedUrl) {
      // 個別 URL 指定
      items = await fetchRssFeed(feedUrl, feedName ?? feedUrl);
    } else if (enabledIds !== undefined) {
      // フロントエンドが選択したフィード ID 一覧
      const ids = enabledIds
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      items = await fetchAllDefaultFeeds(ids);
    } else {
      // デフォルト（全 defaultEnabled フィード）
      items = await fetchAllDefaultFeeds();
    }

    return Response.json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "RSSの取得に失敗しました";
    return Response.json({ error: message }, { status: 500 });
  }
}
