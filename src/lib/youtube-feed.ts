import Parser from "rss-parser";
import { YoutubeTranscript } from "youtube-transcript";
import type { RssFeedItem } from "@/types";
import { ALL_YOUTUBE_CHANNELS, DEFAULT_ENABLED_CHANNEL_IDS, type YouTubeChannelConfig } from "./youtube-channel-configs";
import { classifyTopic } from "./topic-classifier";

const parser = new Parser({
  timeout: 10000,
  headers: { "User-Agent": "NewsPrismView/1.0" },
  customFields: {
    item: [["media:group", "mediaGroup"]],
  },
});

/** YouTube URL または video ID から videoId (11文字) を抽出 */
export function extractVideoId(input: string): string | null {
  // すでに11文字のIDっぽい場合はそのまま返す
  if (/^[A-Za-z0-9_-]{11}$/.test(input)) return input;

  try {
    const url = new URL(input);
    // 通常URL: watch?v=XXXXX
    const v = url.searchParams.get("v");
    if (v) return v;
    // 短縮URL: youtu.be/XXXXX
    if (url.hostname === "youtu.be") return url.pathname.slice(1).split("?")[0];
    // 埋め込みURL: /embed/XXXXX
    const embedMatch = url.pathname.match(/\/embed\/([A-Za-z0-9_-]{11})/);
    if (embedMatch) return embedMatch[1];
  } catch {
    // URLパース失敗 → 正規表現でフォールバック
    const m = input.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/);
    if (m) return m[1];
  }
  return null;
}

/** 動画IDから字幕テキストを取得（日本語優先、fallback で自動生成字幕） */
export async function fetchTranscript(videoId: string): Promise<string | null> {
  try {
    // 日本語字幕を優先して取得
    const items = await YoutubeTranscript.fetchTranscript(videoId, { lang: "ja" });
    return items.map((i) => i.text).join(" ").slice(0, 8000);
  } catch {
    try {
      // 言語指定なしで再試行（自動生成字幕を含む）
      const items = await YoutubeTranscript.fetchTranscript(videoId);
      return items.map((i) => i.text).join(" ").slice(0, 8000);
    } catch {
      return null;
    }
  }
}

/** YouTube RSS からチャンネルの最新動画を RssFeedItem[] で返す */
export async function fetchYouTubeChannelFeed(
  config: YouTubeChannelConfig
): Promise<RssFeedItem[]> {
  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${config.channelId}`;
  const feed = await parser.parseURL(url);

  const items = (feed.items ?? []).slice(0, config.maxVideos).map((item): RssFeedItem => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = item as any;
    // YouTube RSS の thumbnail は media:group > media:thumbnail
    const thumbnailUrl: string | undefined =
      raw.mediaGroup?.["media:thumbnail"]?.[0]?.["$"]?.url ?? undefined;

    const title = item.title ?? "タイトル不明";
    const summary = item.contentSnippet ?? raw.mediaGroup?.["media:description"]?.[0] ?? undefined;

    return {
      title,
      url:         item.link ?? "",
      summary:     typeof summary === "string" ? summary.slice(0, 500) : undefined,
      publishedAt: item.pubDate ?? item.isoDate ?? undefined,
      source:      config.name,
      imageUrl:    thumbnailUrl,
      topic:       classifyTopic(title, typeof summary === "string" ? summary : undefined),
    };
  });

  return items;
}

/** 有効なチャンネル一覧からまとめて取得 */
export async function fetchAllYouTubeFeeds(
  enabledIds: string[] = DEFAULT_ENABLED_CHANNEL_IDS
): Promise<RssFeedItem[]> {
  const channels = ALL_YOUTUBE_CHANNELS.filter((c) => enabledIds.includes(c.id));

  const results = await Promise.allSettled(
    channels.map((c) => fetchYouTubeChannelFeed(c))
  );

  const items = results
    .filter((r): r is PromiseFulfilledResult<RssFeedItem[]> => r.status === "fulfilled")
    .flatMap((r) => r.value);

  // URL で重複除去
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!item.url || seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}
