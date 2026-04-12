import type { Page } from "@playwright/test";
import {
  RSS_FIXTURE,
  BATCH_LATEST_FIXTURE,
  FEED_GROUPS_FIXTURE,
  COMPARE_FIXTURE,
  HOME_ANALYZE_SSE_EVENTS,
  COMPARE_ANALYZE_SSE_EVENTS,
  YOUTUBE_FEED_FIXTURE,
  INSPECT_DETAIL_FIXTURE,
} from "./data";
import { fulfillSSE } from "./sse-mock";

export async function mockAPI(page: Page) {
  await page.route("**/api/rss*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: RSS_FIXTURE }),
    })
  );

  await page.route("**/api/batch/latest", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(BATCH_LATEST_FIXTURE),
    })
  );

  await page.route("**/api/feed-groups*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ groups: FEED_GROUPS_FIXTURE }),
    })
  );

  await page.route("**/api/compare?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ groups: COMPARE_FIXTURE, totalFetched: 50 }),
    })
  );

  await page.route("**/api/fetch-article*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        article: {
          title: "テスト記事1: 防衛費増額を閣議決定",
          content: "防衛費増額が閣議決定された。今後5年間で大幅に増額される見通し。",
          url: "https://example.com/article-1",
          source: "NHKニュース",
          publishedAt: new Date().toISOString(),
        },
      }),
    })
  );

  await page.route("**/api/analyze*", (route) =>
    fulfillSSE(route, HOME_ANALYZE_SSE_EVENTS)
  );

  await page.route("**/api/compare/analyze*", (route) =>
    fulfillSSE(route, COMPARE_ANALYZE_SSE_EVENTS)
  );

  await page.route("**/api/youtube/feed*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: YOUTUBE_FEED_FIXTURE }),
    })
  );

  await page.route("**/api/youtube/analyze*", (route) =>
    fulfillSSE(route, COMPARE_ANALYZE_SSE_EVENTS)
  );

  await page.route("**/api/batch/inspect?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(INSPECT_DETAIL_FIXTURE),
    })
  );
}
