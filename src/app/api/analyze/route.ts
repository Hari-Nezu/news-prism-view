import { analyzeArticle, analyzeArticleMultiModel } from "@/lib/ollama";
import { saveArticle } from "@/lib/db";
import { embedArticle } from "@/lib/embeddings";
import { classifyTopic } from "@/lib/topic-classifier";
import { z } from "zod";

const RequestSchema = z.object({
  title:      z.string().min(1),
  content:    z.string().min(10),
  url:        z.string().url().optional(),
  source:     z.string().optional(),
  multiModel: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { title, content, url, source, multiModel } = RequestSchema.parse(body);

    // ── シングルモデル（従来動作） ──
    if (!multiModel) {
      const analysis = await analyzeArticle(title, content);
      const topic = classifyTopic(title, analysis.summary);
      const article = { title, content, url, source, analysis, analyzedAt: new Date().toISOString(), topic };
      embedArticle(title, analysis.summary)
        .then((embedding) => saveArticle(article, embedding ?? undefined))
        .catch((err) => console.error("[analyze] DB保存エラー:", err));
      return Response.json({ analysis });
    }

    // ── マルチモデル（SSE） ──
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };

        let firstAnalysis: Awaited<ReturnType<typeof analyzeArticle>> | null = null;

        for await (const { model, result, index, total } of analyzeArticleMultiModel(title, content)) {
          if (!firstAnalysis) firstAnalysis = result;
          send("model-result", { model, index, total, result });
        }

        // DB保存（コンセンサス = 1モデル目の結果）
        if (firstAnalysis) {
          const topic = classifyTopic(title, firstAnalysis.summary);
          const article = { title, content, url, source, analysis: firstAnalysis, analyzedAt: new Date().toISOString(), topic };
          embedArticle(title, firstAnalysis.summary)
            .then((embedding) => saveArticle(article, embedding ?? undefined))
            .catch((err) => console.error("[analyze] DB保存エラー:", err));
        }

        send("done", {});
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
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "入力データが不正です", details: error.issues },
        { status: 400 }
      );
    }
    const message = error instanceof Error ? error.message : "不明なエラー";
    console.error("[analyze] エラー:", error);
    return Response.json({ error: message }, { status: 500 });
  }
}
