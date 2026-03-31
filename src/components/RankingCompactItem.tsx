"use client";

import type { NewsGroup, RssFeedItem } from "@/types";
import { getSourceColors } from "@/lib/source-colors"; // 記事一覧内で使用

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
        <span className="text-xs font-bold text-gray-400 w-6 text-right flex-shrink-0">
          {rank}
        </span>
        <span className="flex-1 text-sm font-semibold text-gray-800 truncate">
          {group.groupTitle}
        </span>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[10px] text-gray-400">{group.items.length}件</span>
          <span className="text-gray-300 text-xs">{isExpanded ? "▼" : "▶"}</span>
        </div>
      </button>

      <div className={`ranking-expand ${isExpanded ? "open" : ""}`}>
        <div>
          <div className="border-t border-gray-100 divide-y divide-gray-50">
            {group.items.map((item, i) => (
              <div key={i} className="px-4 py-2.5 flex items-start gap-3 hover:bg-blue-50 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[10px] font-semibold" style={{ color: getSourceColors(item.source).textColor }}>
                      {item.source}
                    </span>
                  </div>
                  <p className="text-xs text-gray-800 line-clamp-2 leading-snug">{item.title}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
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
                  >
                    🔍
                  </button>
                  {item.url && (
                    <a href={item.url} target="_blank" rel="noopener noreferrer"
                      className="text-[10px] text-gray-400 hover:text-gray-600"
                      onClick={(e) => e.stopPropagation()}
                    >↗</a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
