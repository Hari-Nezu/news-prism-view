import type { NewsGroup } from "@/types";

export function sortGroups(groups: NewsGroup[]): NewsGroup[] {
  return [...groups].sort((a, b) => {
    if (a.singleOutlet !== b.singleOutlet) return a.singleOutlet ? 1 : -1;
    const sa = new Set((a.items ?? []).map((i) => i.source)).size;
    const sb = new Set((b.items ?? []).map((i) => i.source)).size;
    if (sb !== sa) return sb - sa;
    return (b.items?.length ?? 0) - (a.items?.length ?? 0);
  });
}
