import { describe, it, expect } from "vitest";
import { groupItemsBySource } from "@/lib/group-items-by-source";
import type { RssFeedItem } from "@/types";

function makeItem(source: string, title = "title"): RssFeedItem {
  return { title, url: "https://example.com", source };
}

describe("groupItemsBySource", () => {
  it("空配列を渡すと空 Map を返す", () => {
    const result = groupItemsBySource([]);
    expect(result.size).toBe(0);
  });

  it("同一ソースの記事が1つのキーにまとまる", () => {
    const items = [makeItem("NHK"), makeItem("NHK"), makeItem("NHK")];
    const result = groupItemsBySource(items);
    expect(result.size).toBe(1);
    expect(result.get("NHK")).toHaveLength(3);
  });

  it("異なるソースが別々のキーに分かれる", () => {
    const items = [makeItem("NHK"), makeItem("朝日新聞"), makeItem("産経新聞")];
    const result = groupItemsBySource(items);
    expect(result.size).toBe(3);
    expect(result.get("NHK")).toHaveLength(1);
    expect(result.get("朝日新聞")).toHaveLength(1);
    expect(result.get("産経新聞")).toHaveLength(1);
  });

  it("ソース混在でも正しくグループ化される", () => {
    const items = [
      makeItem("NHK", "A"),
      makeItem("朝日新聞", "B"),
      makeItem("NHK", "C"),
      makeItem("朝日新聞", "D"),
      makeItem("読売新聞", "E"),
    ];
    const result = groupItemsBySource(items);
    expect(result.size).toBe(3);
    expect(result.get("NHK")!.map((i) => i.title)).toEqual(["A", "C"]);
    expect(result.get("朝日新聞")!.map((i) => i.title)).toEqual(["B", "D"]);
    expect(result.get("読売新聞")!.map((i) => i.title)).toEqual(["E"]);
  });

  it("元の RssFeedItem オブジェクト参照が保持される", () => {
    const item = makeItem("NHK");
    const result = groupItemsBySource([item]);
    expect(result.get("NHK")![0]).toBe(item);
  });

  it("挿入順が維持される", () => {
    const items = [makeItem("NHK", "1"), makeItem("NHK", "2"), makeItem("NHK", "3")];
    const result = groupItemsBySource(items);
    expect(result.get("NHK")!.map((i) => i.title)).toEqual(["1", "2", "3"]);
  });
});
