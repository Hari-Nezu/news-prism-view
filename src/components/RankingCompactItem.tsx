"use client";

import type { NewsGroup, RssFeedItem } from "@/types";
import { getSourceColors } from "@/lib/source-colors";
import { groupItemsBySource } from "@/lib/group-items-by-source";

interface Props {
  group: NewsGroup;
  rank: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  analyzedUrls: string[];
  analyzingUrl?: string;
  onAnalyze: (item: RssFeedItem) => void;
  onCompareArticle?: (item: RssFeedItem) => void;
  style?: React.CSSProperties;
}

export default function RankingCompactItem({
  group, rank, isExpanded, onToggleExpand,
  analyzedUrls, analyzingUrl, onAnalyze, onCompareArticle, style,
}: Props) {
  const sources = [...new Set(group.items.map((i) => i.source))];

  return (
    <div
      className={`rounded-lg border bg-white overflow-hidden ranking-item ${
        group.singleOutlet ? "border-gray-100 opacity-60" : "border-gray-200"
      }`}
      style={style}
    >
      <button
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
        onClick={onToggleExpand}
      >
        <span className="text-xs font-bold text-gray-400 w-6 text-right flex-shrink-0 tabular-nums">
          {rank}
        </span>
        <span className="flex-1 text-sm font-semibold text-gray-800 truncate">
          {group.groupTitle}
        </span>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* 媒体ドット（小） */}
          <div className="flex items-center gap-0.5">
            {sources.slice(0, 4).map((s) => (
              <span
                key={s}
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: getSourceColors(s).dotColor }}
                title={s}
              />
            ))}
            {sources.length > 4 && (
              <span className="text-[9px] text-gray-400 ml-0.5">+{sources.length - 4}</span>
            )}
          </div>
          <span className="text-[10px] text-gray-400 tabular-nums">{group.items.length}件</span>
          <span className="text-gray-300 text-xs">{isExpanded ? "▼" : "▶"}</span>
        </div>
      </button>

      <div className={`ranking-expand ${isExpanded ? "open" : ""}`}>
        <div>
          <div className="border-t border-gray-100 p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {Array.from(groupItemsBySource(group.items)).map(([source, items]) => {
              const colors = getSourceColors(source);
              return (
                <div key={source} className="border border-gray-100 rounded-lg overflow-hidden" style={{ borderLeftColor: colors.dotColor, borderLeftWidth: "3px" }}>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50/60">
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: colors.dotColor }} />
                    <span className="text-[11px] font-bold truncate" style={{ color: colors.textColor }}>{source}</span>
                    <span className="text-[10px] text-gray-400 ml-auto flex-shrink-0">{items.length}件</span>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {items.map((item, i) => (
                      <div key={i} className="px-3 py-2 hover:bg-blue-50/60 transition-colors">
                        <div className="flex items-start gap-2">
                          <p className="flex-1 text-xs text-gray-800 line-clamp-2 leading-snug min-w-0">{item.title}</p>
                          <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                            <button
                              onClick={() => onAnalyze(item)}
                              disabled={item.url === analyzingUrl}
                              className={`text-[11px] font-semibold px-2 py-1 rounded-lg transition-all ${
                                item.url === analyzingUrl
                                  ? "bg-blue-100 text-blue-400 cursor-wait"
                                  : item.url && analyzedUrls.includes(item.url)
                                    ? "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                    : "bg-blue-600 text-white hover:bg-blue-700"
                              }`}
                            >🔍</button>
                            {item.url && (
                              <a href={item.url} target="_blank" rel="noopener noreferrer"
                                className="text-[10px] text-gray-400 hover:text-gray-600"
                                onClick={(e) => e.stopPropagation()}
                              >↗</a>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
