import { describe, it, expect } from "vitest";
import { parseSSEBuffer } from "@/lib/parse-sse";

describe("parseSSEBuffer", () => {
  it("完全なイベントブロックをパースする", () => {
    const buffer = 'event: model-result\ndata: {"key":"value"}\n\n';
    const { events, remaining } = parseSSEBuffer(buffer);
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("model-result");
    expect(events[0].data).toEqual({ key: "value" });
    expect(remaining).toBe("");
  });

  it("不完全なバッファ → 残りを返す", () => {
    const buffer = 'event: model-result\ndata: {"ke';
    const { events, remaining } = parseSSEBuffer(buffer);
    expect(events).toHaveLength(0);
    expect(remaining).toBe(buffer);
  });

  it("data 行のみ（event なし）→ 正しくパース", () => {
    const buffer = 'data: {"key":"value"}\n\n';
    const { events } = parseSSEBuffer(buffer);
    expect(events).toHaveLength(1);
    expect(events[0].event).toBeUndefined();
    expect(events[0].data).toEqual({ key: "value" });
  });

  it("JSON パースエラー → スキップ", () => {
    const buffer = "event: test\ndata: {invalid json}\n\n";
    const { events } = parseSSEBuffer(buffer);
    expect(events).toHaveLength(0);
  });

  it("複数イベントが1チャンクに入る場合", () => {
    const buffer = 'event: a\ndata: {"n":1}\n\nevent: b\ndata: {"n":2}\n\n';
    const { events } = parseSSEBuffer(buffer);
    expect(events).toHaveLength(2);
    expect(events[0].event).toBe("a");
    expect((events[0].data as { n: number }).n).toBe(1);
    expect(events[1].event).toBe("b");
    expect((events[1].data as { n: number }).n).toBe(2);
  });
});
