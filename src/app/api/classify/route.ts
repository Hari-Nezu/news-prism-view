import { z } from "zod";
import { classifyArticleLLM } from "@/lib/news-classifier-llm";
import { CATEGORY_MAP } from "@/lib/config/news-taxonomy-configs";

const RequestSchema = z.object({
  title:   z.string().min(1),
  summary: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { title, summary } = RequestSchema.parse(body);

    const result = await classifyArticleLLM(title, summary);
    const categoryDef = CATEGORY_MAP.get(result.category);

    return Response.json({
      category:    result.category,
      subcategory: result.subcategory,
      confidence:  result.confidence,
      label:       categoryDef?.label,
      icon:        categoryDef?.icon,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "入力データが不正です", details: error.issues }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "不明なエラー";
    return Response.json({ error: message }, { status: 500 });
  }
}
