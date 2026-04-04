"use client";

import type { NewsGroup, RssFeedItem } from "@/types";
import { getSourceColors } from "@/lib/source-colors";

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

const RANK_STYLES: Record<number, string> = {
  2: "bg-gradient-to-br from-gray-300 to-gray-400 text-white",
  3: "bg-gradient-to-br from-amber-600 to-amber-700 text-white",
};

export default function RankingMediumCard({
  group, rank, isExpanded, onToggleExpand,
  analyzedUrls, analyzingUrl, onAnalyze, onCompareArticle, style,
}: Props) {
  const sources = [...new Set(group.items.map((i) => i.source))];
  const rankClass = RANK_STYLES[rank] ?? "bg-gray-700 text-white";

  return (
    <div
      className="rounded-xl border border-gray-200 bg-white shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden ranking-item"
      style={style}
    >
      <button
        className="w-full flex items-start gap-3 px-4 py-4 hover:bg-gray-50/60 transition-colors text-left"
        onClick={onToggleExpand}
      >
        <span className={`w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5 ${rankClass}`}>
          {rank}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-base font-bold text-gray-900 line-clamp-2 leading-snug mb-2">
            {group.groupTitle}
          </p>
          {/* メタ行: 件数 + 媒体ドット */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-semibold text-gray-400">
              {group.items.length}件
            </span>
            <span className="text-gray-200">|</span>
            <div className="flex items-center gap-1 flex-wrap">
              {sources.map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center gap-0.5 text-[10px] font-medium"
                  style={{ color: getSourceColors(s).textColor }}
                  title={s}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: getSourceColors(s).dotColor }} />
                  {s}
                </span>
              ))}
            </div>
          </div>
        </div>
        <span className="text-gray-300 text-xs flex-shrink-0 mt-1">
          {isExpanded ? "▼" : "▶"}
        </span>
      </button>

      <div className={`ranking-expand ${isExpanded ? "open" : ""}`}>
        <div>
          <div className="border-t border-gray-100 divide-y divide-gray-50">
            {group.items.map((item, i) => (
              <div key={i} className="px-4 py-3 flex items-start gap-3 hover:bg-blue-50/60 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[10px] font-semibold" style={{ color: getSourceColors(item.source).textColor }}>
                      {item.source}
                    </span>
                    {item.publishedAt && (
                      <span className="text-[10px] text-gray-400">{formatRelative(item.publishedAt)}</span>
                    )}
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
                  {onCompareArticle && (
                    <button
                      onClick={() => onCompareArticle(item)}
                      className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-purple-50 text-purple-600 hover:bg-purple-100 transition-colors"
                    >
                      📊
                    </button>
                  )}
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

function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return "今";
  if (mins < 60) return `${mins}分前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}時間前`;
  return `${Math.floor(hours / 24)}日前`;
}
