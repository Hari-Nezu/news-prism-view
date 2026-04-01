import type { RssFeedItem } from "@/types";
import { NEWSDATA_API_KEY } from "@/lib/config";

interface NewsdataArticle {
  title: string;
  link: string;
  description: string | null;
  pubDate: string | null;
  source_name: string;
  image_url: string | null;
}

interface NewsdataResponse {
  status: string;
  results: NewsdataArticle[];
}

/**
 * NewsData.io から日本語ニュースを取得する。
 * NEWSDATA_API_KEY が未設定の場合は空配列を返す。
 */
export async function fetchNewsdataArticles(): Promise<RssFeedItem[]> {
  if (!NEWSDATA_API_KEY) return [];
  const apiKey = NEWSDATA_API_KEY;

  try {
    const params = new URLSearchParams({
      apikey: apiKey,
      language: "ja",
      country: "jp",
      category: "politics,top,world",
      size: "20",
    });

    const res = await fetch(`https://newsdata.io/api/1/news?${params}`, {
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) {
      console.warn("[newsdata] APIエラー:", res.status);
      return [];
    }

    const data: NewsdataResponse = await res.json();
    if (data.status !== "success" || !Array.isArray(data.results)) return [];

    return data.results.map((a): RssFeedItem => ({
      title: a.title,
      url: a.link,
      summary: a.description ?? undefined,
      publishedAt: a.pubDate ?? undefined,
      source: a.source_name,
      imageUrl: a.image_url ?? undefined,
    }));
  } catch (e) {
    console.warn("[newsdata] 取得エラー:", e);
    return [];
  }
}
