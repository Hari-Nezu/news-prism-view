import { analyzeArticle } from "@/lib/ollama";
import { fetchTranscript, extractVideoId } from "@/lib/youtube-feed";
import { saveYouTubeVideo } from "@/lib/db";
import { embedArticle } from "@/lib/embeddings";
import { classifyArticleLLM } from "@/lib/news-classifier-llm";
import { ALL_YOUTUBE_CHANNELS } from "@/lib/config/youtube-channel-configs";
import { z } from "zod";

const ItemSchema = z.object({
  title:       z.string(),
  url:         z.string().url(),
  source:      z.string(),
  summary:     z.string().optional(),
  publishedAt: z.string().optional(),
  imageUrl:    z.string().optional(),
});

const RequestSchema = z.object({
  items: z.array(ItemSchema).min(1).max(20),
});

// レートリミット用 sleep
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "リクエストの解析に失敗しました" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "入力データが不正です", details: parsed.error.issues }, { status: 400 });
  }

  const { items } = parsed.data;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (i > 0) await sleep(1000); // レートリミット

        send("progress", { index: i, total: items.length, title: item.title });

        try {
          // 字幕取得（fallback: summary/description）
          const videoId = extractVideoId(item.url);
          let transcript = videoId ? await fetchTranscript(videoId) : null;
          let transcriptType: "transcript" | "description" = "transcript";

          if (!transcript) {
            transcript = item.summary ?? item.title;
            transcriptType = "description";
          }

          // 分析
          const analysis = await analyzeArticle(item.title, transcript);
          const { category: topic, subcategory } = await classifyArticleLLM(item.title, analysis.summary);

          // チャンネルID を config から取得
          const channelConfig = ALL_YOUTUBE_CHANNELS.find((c) => c.name === item.source);
          const channelId = channelConfig?.channelId ?? "";

          const result = {
            title:         item.title,
            url:           item.url,
            source:        item.source,
            imageUrl:      item.imageUrl,
            publishedAt:   item.publishedAt,
            analysis,
            analyzedAt:    new Date().toISOString(),
            topic,
            transcriptType,
          };

          send("result", { index: i, article: result });

          // DB保存（ノンブロッキング）
          if (videoId) {
            embedArticle(item.title, analysis.summary)
              .then((embedding) =>
                saveYouTubeVideo(
                  {
                    videoId,
                    title:         item.title,
                    channelName:   item.source,
                    channelId,
                    description:   item.summary,
                    thumbnailUrl:  item.imageUrl,
                    publishedAt:   item.publishedAt,
                    transcript:    transcript!.slice(0, 10000),
                    transcriptType,
                    economic:      analysis.scores.economic,
                    social:        analysis.scores.social,
                    diplomatic:    analysis.scores.diplomatic,
                    emotionalTone: analysis.emotionalTone,
                    biasWarning:   analysis.biasWarning,
                    confidence:    analysis.confidence,
                    summary:       analysis.summary,
                    counterOpinion: analysis.counterOpinion,
                    topic,
                    subcategory,
                  },
                  embedding ?? undefined
                )
              )
              .catch((err) => console.error("[youtube/analyze] DB保存エラー:", err));
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : "分析失敗";
          send("error", { index: i, title: item.title, message });
        }
      }

      send("done", { total: items.length });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
