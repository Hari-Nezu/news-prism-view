import { describe, it, expect } from "vitest";
import { sortGroups } from "@/lib/sort-groups";
import type { NewsGroup } from "@/types";

function makeGroup(overrides: Partial<NewsGroup> & { sources?: string[] } = {}): NewsGroup {
  const { sources, ...rest } = overrides;
  return {
    groupTitle: "test",
    items: sources ? sources.map((s) => ({ title: "", url: "", source: s })) : [],
    singleOutlet: false,
    ...rest,
  };
}

describe("sortGroups", () => {
  it("singleOutlet=true のグループは末尾", () => {
    const groups = [
      makeGroup({ groupTitle: "single", singleOutlet: true }),
      makeGroup({ groupTitle: "multi", singleOutlet: false, sources: ["A", "B"] }),
    ];
    const sorted = sortGroups(groups);
    expect(sorted[0].groupTitle).toBe("multi");
    expect(sorted[1].groupTitle).toBe("single");
  });

  it("同条件ならユニークソース数の多い順", () => {
    const groups = [
      makeGroup({ groupTitle: "2sources", sources: ["A", "B"] }),
      makeGroup({ groupTitle: "3sources", sources: ["A", "B", "C"] }),
    ];
    const sorted = sortGroups(groups);
    expect(sorted[0].groupTitle).toBe("3sources");
  });

  it("ユニークソース数も同じなら記事数の多い順", () => {
    const groups = [
      makeGroup({ groupTitle: "2items", sources: ["A", "B"] }),
      makeGroup({ groupTitle: "3items", sources: ["A", "B", "A"] }), // 同じユニーク数(A,B)、記事3件
    ];
    const sorted = sortGroups(groups);
    expect(sorted[0].groupTitle).toBe("3items");
  });

  it("空配列 → 空配列", () => {
    expect(sortGroups([])).toEqual([]);
  });

  it("items が undefined でも動作する", () => {
    const groups: NewsGroup[] = [
      { groupTitle: "a", singleOutlet: false, items: undefined as unknown as NewsGroup["items"] },
      makeGroup({ groupTitle: "b", sources: ["A"] }),
    ];
    const sorted = sortGroups(groups);
    expect(sorted).toHaveLength(2);
  });
});
