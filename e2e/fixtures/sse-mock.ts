import type { Route } from "@playwright/test";

export function fulfillSSE(route: Route, events: Array<{ event: string; data: object }>) {
  const body = events
    .map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n`)
    .join("\n");

  return route.fulfill({
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
    body,
  });
}
