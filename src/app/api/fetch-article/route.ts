import { fetchArticleFromUrl } from "@/lib/article-fetcher";
import { z } from "zod";

const RequestSchema = z.object({
  url: z.string().url(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { url } = RequestSchema.parse(body);

    const article = await fetchArticleFromUrl(url);
    return Response.json({ article });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "有効なURLを入力してください" },
        { status: 400 }
      );
    }
    const message = error instanceof Error ? error.message : "記事の取得に失敗しました";
    return Response.json({ error: message }, { status: 500 });
  }
}
