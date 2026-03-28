import { fetchArticleFromUrl } from "@/lib/article-fetcher";
import { analyzeArticle } from "@/lib/ollama";
import { saveCompareResults } from "@/lib/db";
import { embedArticle } from "@/lib/embeddings";
import { z } from "zod";
import type { AnalyzedArticle } from "@/types";

const ItemSchema = z.object({
  title:       z.string(),
  url:         z.string().url(),
  source:      z.string(),
  publishedAt: z.string().optional(),
});

const RequestSchema = z.object({
  items:     z.array(ItemSchema).min(1).max(10),
  sessionId: z.string().optional(), // 比較セッションIDと紐付け
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "リクエストの解析に失敗しました" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "入力データが不正です" }, { status: 400 });
  }

  const { items, sessionId } = parsed.data;

  const encoder = new TextEncoder();
  const collectedResults: AnalyzedArticle[] = [];
  const collectedEmbeddings: Record<number, number[]> = {};

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        send("progress", { index: i, total: items.length, title: item.title });

        try {
          const article = await fetchArticleFromUrl(item.url);
          const analysis = await analyzeArticle(article.title, article.content);

          const result: AnalyzedArticle = {
            title:       article.title,
            content:     article.content,
            url:         item.url,
            source:      item.source,
            publishedAt: item.publishedAt,
            analysis,
            analyzedAt: new Date().toISOString(),
          };

          collectedResults.push(result);

          // 埋め込みも並行生成（レスポンスをブロックしない）
          embedArticle(article.title, analysis.summary).then((vec) => {
            if (vec) collectedEmbeddings[i] = vec;
          });

          send("result", { index: i, article: result });
        } catch (err) {
          const message = err instanceof Error ? err.message : "分析失敗";
          send("error", { index: i, title: item.title, message });
        }
      }

      send("done", { total: items.length });
      controller.close();

      // ストリーム完了後にDB保存
      if (sessionId && collectedResults.length > 0) {
        // 埋め込み生成が終わるまで少し待つ
        await new Promise((r) => setTimeout(r, 3000));
        saveCompareResults(sessionId, collectedResults, collectedEmbeddings)
          .catch((err) => console.error("[compare/analyze] DB保存エラー:", err));
      }
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
