export interface SSEEvent {
  event?: string;
  data: unknown;
}

/**
 * SSE バッファをパースしてイベント配列と残余バッファを返す
 * イベントブロックは \n\n で区切られる
 */
export function parseSSEBuffer(buffer: string): { events: SSEEvent[]; remaining: string } {
  const events: SSEEvent[] = [];
  const blocks = buffer.split("\n\n");
  const remaining = blocks.pop() ?? "";

  for (const block of blocks) {
    if (!block.trim()) continue;
    const lines = block.split("\n");
    let eventType: string | undefined;
    for (const line of lines) {
      if (line.startsWith("event: ")) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        try {
          const data = JSON.parse(line.slice(6));
          events.push({ event: eventType, data });
        } catch {
          // skip invalid JSON
        }
        eventType = undefined;
      }
    }
  }

  return { events, remaining };
}
