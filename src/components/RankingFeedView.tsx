"use client";

import { useState } from "react";
import type { NewsGroup, RssFeedItem } from "@/types";
import RankingMediumCard from "./RankingMediumCard";
import RankingCompactItem from "./RankingCompactItem";

interface Props {
  groups: NewsGroup[];
  totalSourceCount: number;
  analyzedUrls: string[];
  analyzingUrl?: string;
  onAnalyze: (item: RssFeedItem) => void;
  onCompareArticle?: (item: RssFeedItem) => void;
}

export default function RankingFeedView({
  groups, totalSourceCount: _totalSourceCount, analyzedUrls, analyzingUrl, onAnalyze, onCompareArticle,
}: Props) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  function toggle(i: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  // ソート: singleOutlet 末尾 → ユニーク媒体数降順 → 記事数降順
  const sorted = [...groups].sort((a, b) => {
    if (a.singleOutlet !== b.singleOutlet) return a.singleOutlet ? 1 : -1;
    const sa = new Set(a.items.map((i) => i.source)).size;
    const sb = new Set(b.items.map((i) => i.source)).size;
    if (sb !== sa) return sb - sa;
    return b.items.length - a.items.length;
  });

  const multiOutlet  = sorted.filter((g) => !g.singleOutlet);
  const singleOutlet = sorted.filter((g) =>  g.singleOutlet);

  const cardProps = (globalIndex: number) => ({
    isExpanded: expanded.has(globalIndex),
    onToggleExpand: () => toggle(globalIndex),
    analyzedUrls,
    analyzingUrl,
    onAnalyze,
    onCompareArticle,
    style: { animationDelay: `${globalIndex * 80}ms` } as React.CSSProperties,
  });

  return (
    <div className="space-y-3">
      {multiOutlet.map((g, i) => (
        <RankingMediumCard
          key={i}
          group={g}
          rank={i + 1}
          {...cardProps(i)}
        />
      ))}

      {singleOutlet.length > 0 && (
        <>
          <div className="flex items-center gap-2 py-1">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-[10px] font-medium text-gray-400 px-2">単独報道</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>
          {singleOutlet.map((g, si) => (
            <RankingCompactItem
              key={si}
              group={g}
              rank={multiOutlet.length + si + 1}
              {...cardProps(multiOutlet.length + si)}
            />
          ))}
        </>
      )}
    </div>
  );
}
