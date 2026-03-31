import { fetchAllYouTubeFeeds } from "@/lib/youtube-feed";
import { z } from "zod";

const QuerySchema = z.object({
  channels: z.string().optional(), // カンマ区切りの内部ID
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = QuerySchema.safeParse({ channels: searchParams.get("channels") ?? undefined });

  if (!parsed.success) {
    return Response.json({ error: "パラメータが不正です" }, { status: 400 });
  }

  const enabledIds = parsed.data.channels
    ? parsed.data.channels.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;

  try {
    const items = await fetchAllYouTubeFeeds(enabledIds);
    return Response.json({ items, total: items.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "フィード取得エラー";
    console.error("[youtube/feed]", err);
    return Response.json({ error: message }, { status: 500 });
  }
}
