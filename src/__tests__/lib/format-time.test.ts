import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { formatRelative, formatDateTime } from "@/lib/format-time";

describe("formatRelative", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-15T10:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("60秒未満 → '今'", () => {
    const dateStr = new Date(Date.now() - 30_000).toISOString();
    expect(formatRelative(dateStr)).toBe("今");
  });

  it("1分 → '1分前'", () => {
    const dateStr = new Date(Date.now() - 60_000).toISOString();
    expect(formatRelative(dateStr)).toBe("1分前");
  });

  it("59分 → '59分前'", () => {
    const dateStr = new Date(Date.now() - 59 * 60_000).toISOString();
    expect(formatRelative(dateStr)).toBe("59分前");
  });

  it("1時間 → '1時間前'", () => {
    const dateStr = new Date(Date.now() - 3_600_000).toISOString();
    expect(formatRelative(dateStr)).toBe("1時間前");
  });

  it("23時間 → '23時間前'", () => {
    const dateStr = new Date(Date.now() - 23 * 3_600_000).toISOString();
    expect(formatRelative(dateStr)).toBe("23時間前");
  });

  it("24時間以上 → '1日前'", () => {
    const dateStr = new Date(Date.now() - 24 * 3_600_000).toISOString();
    expect(formatRelative(dateStr)).toBe("1日前");
  });

  it("未来の日付 → '今'（diff < 0 → mins < 1）", () => {
    const dateStr = new Date(Date.now() + 60_000).toISOString();
    expect(formatRelative(dateStr)).toBe("今");
  });
});

describe("formatDateTime", () => {
  it("ISO文字列を ja-JP 形式に変換する", () => {
    const result = formatDateTime("2025-01-15T10:30:00Z");
    expect(result).toMatch(/2025/);
    expect(result).toMatch(/01/);
    expect(result).toMatch(/15/);
    expect(result).toMatch(/:/);
  });
});
