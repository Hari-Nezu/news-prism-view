"use client";

import { useState } from "react";
import type { NewsGroup, RssFeedItem } from "@/types";
import RankingHeroCard from "./RankingHeroCard";
import RankingMediumCard from "./RankingMediumCard";
import RankingCompactItem from "./RankingCompactItem";

interface Props {
  groups: NewsGroup[];
  analyzedUrls: string[];
  analyzingUrl?: string;
  onAnalyze: (item: RssFeedItem) => void;
  onCompareArticle?: (item: RssFeedItem) => void;
}

export default function RankingFeedView({
  groups, analyzedUrls, analyzingUrl, onAnalyze, onCompareArticle,
}: Props) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set([0]));

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

  // 全グループ横断のユニーク媒体数（カバレッジバーの分母）
  const totalSourceCount = new Set(
    sorted.flatMap((g) => g.items.map((i) => i.source))
  ).size;

  const commonProps = (globalIndex: number) => ({
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
      {/* #1 はヒーローカード */}
      {multiOutlet.length > 0 && (
        <RankingHeroCard
          group={multiOutlet[0]}
          totalSourceCount={totalSourceCount}
          {...commonProps(0)}
        />
      )}

      {/* #2~ はミディアムカード */}
      {multiOutlet.slice(1).map((g, i) => (
        <RankingMediumCard
          key={i + 1}
          group={g}
          rank={i + 2}
          {...commonProps(i + 1)}
        />
      ))}

      {/* 単独報道セクション */}
      {singleOutlet.length > 0 && (
        <>
          <div className="flex items-center gap-2 py-1 mt-2">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-[10px] font-medium text-gray-400 px-2 tracking-wider">単独報道</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>
          {singleOutlet.map((g, si) => (
            <RankingCompactItem
              key={si}
              group={g}
              rank={multiOutlet.length + si + 1}
              {...commonProps(multiOutlet.length + si)}
            />
          ))}
        </>
      )}
    </div>
  );
}
