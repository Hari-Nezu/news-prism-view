import { describe, it, expect } from "vitest";
import { findDuplicateIndex } from "@/lib/find-duplicate";
import type { MultiModelAnalyzedArticle } from "@/types";

function makeArticle(overrides: Partial<MultiModelAnalyzedArticle> = {}): MultiModelAnalyzedArticle {
  return {
    title: "test",
    content: "",
    url: "https://example.com/default",
    analysis: {
      scores: { economic: 0, social: 0, diplomatic: 0 },
      emotionalTone: 0,
      biasWarning: false,
      summary: "",
      counterOpinion: "",
      confidence: 1,
    },
    analyzedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("findDuplicateIndex", () => {
  it("URL が一致する記事があればそのインデックスを返す", () => {
    const articles = [
      makeArticle({ url: "https://example.com/1" }),
      makeArticle({ url: "https://example.com/2" }),
    ];
    expect(findDuplicateIndex(articles, { url: "https://example.com/2", title: "other" })).toBe(1);
  });

  it("URL なしでも title が一致すればインデックスを返す", () => {
    const articles = [makeArticle({ url: undefined, title: "foo" })];
    expect(findDuplicateIndex(articles, { url: undefined, title: "foo" })).toBe(0);
  });

  it("一致なしなら -1", () => {
    const articles = [makeArticle({ url: "https://example.com/1", title: "foo" })];
    expect(findDuplicateIndex(articles, { url: "https://example.com/999", title: "bar" })).toBe(-1);
  });

  it("空配列なら -1", () => {
    expect(findDuplicateIndex([], { url: "https://example.com", title: "foo" })).toBe(-1);
  });

  it("URL 一致を title 一致より優先する", () => {
    const articles = [
      makeArticle({ url: "https://example.com/1", title: "title-A" }),
      makeArticle({ url: "https://example.com/2", title: "title-B" }),
    ];
    // url が /2 に一致、title は /1 にある "title-A" に一致するが url が優先
    expect(findDuplicateIndex(articles, { url: "https://example.com/2", title: "title-A" })).toBe(1);
  });
});
