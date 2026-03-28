import { analyzeArticle } from "@/lib/ollama";
import { saveArticle } from "@/lib/db";
import { embedArticle } from "@/lib/embeddings";
import { z } from "zod";

const RequestSchema = z.object({
  title:   z.string().min(1),
  content: z.string().min(10),
  url:     z.string().url().optional(),
  source:  z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { title, content, url, source } = RequestSchema.parse(body);

    const analysis = await analyzeArticle(title, content);

    // DB保存と埋め込み生成を並行実行（失敗してもレスポンスはブロックしない）
    const article = { title, content, url, source, analysis, analyzedAt: new Date().toISOString() };
    embedArticle(title, analysis.summary)
      .then((embedding) => saveArticle(article, embedding ?? undefined))
      .catch((err) => console.error("[analyze] DB保存エラー:", err));

    return Response.json({ analysis });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "入力データが不正です", details: error.issues },
        { status: 400 }
      );
    }
    const message = error instanceof Error ? error.message : "不明なエラー";
    console.error("[analyze] エラー:", error); // スタックトレースを含む全体をログ
    return Response.json({ error: message }, { status: 500 });
  }
}
