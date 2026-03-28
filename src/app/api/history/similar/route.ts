import { findSimilarArticles } from "@/lib/db";
import { embed } from "@/lib/embeddings";
import { z } from "zod";

const RequestSchema = z.object({
  text:      z.string().min(1),
  excludeId: z.string().optional(),
  limit:     z.number().int().min(1).max(10).optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { text, excludeId, limit } = RequestSchema.parse(body);

    const embedding = await embed(text);
    if (!embedding) {
      return Response.json({ similar: [], reason: "埋め込みモデルが利用できません" });
    }

    const similar = await findSimilarArticles(embedding, excludeId, limit ?? 5);
    return Response.json({ similar });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "入力データが不正です" }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "類似検索に失敗しました";
    return Response.json({ error: message }, { status: 500 });
  }
}
