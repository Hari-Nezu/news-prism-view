"use client";

import type { NewsGroup, RssFeedItem } from "@/types";
import { getSourceColors } from "@/lib/source-colors";

interface Props {
  group: NewsGroup;
  totalSourceCount: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  analyzedUrls: string[];
  analyzingUrl?: string;
  onAnalyze: (item: RssFeedItem) => void;
  onCompareArticle?: (item: RssFeedItem) => void;
  style?: React.CSSProperties;
}

export default function RankingHeroCard({
  group, totalSourceCount, isExpanded, onToggleExpand,
  analyzedUrls, analyzingUrl, onAnalyze, onCompareArticle, style,
}: Props) {
  const sources = [...new Set(group.items.map((i) => i.source))];
  const coveragePct = totalSourceCount > 0
    ? Math.round((sources.length / totalSourceCount) * 100)
    : 0;

  return (
    <div
      className="rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50/80 via-white to-orange-50/40 shadow-md overflow-hidden ranking-hero"
      style={style}
    >
      <button
        className="w-full flex items-start gap-4 px-5 py-5 hover:bg-amber-50/40 transition-colors text-left"
        onClick={onToggleExpand}
      >
        {/* ランクバッジ */}
        <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white font-black text-lg flex items-center justify-center flex-shrink-0 shadow-sm">
          1
        </span>

        <div className="flex-1 min-w-0">
          {/* タイトル */}
          <p className="text-lg font-bold text-gray-900 line-clamp-2 leading-snug mb-3">
            {group.groupTitle}
          </p>

          {/* メタ行 */}
          <div className="flex items-center gap-3 mb-2.5">
            <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
              {group.items.length}件
            </span>
            <span className="text-xs text-amber-600/80 font-medium">
              {sources.length}媒体が報道
            </span>
          </div>

          {/* 媒体ドット */}
          <div className="flex items-center gap-1.5 flex-wrap mb-2.5">
            {sources.map((s) => (
              <span
                key={s}
                className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                style={{
                  backgroundColor: getSourceColors(s).bgColor,
                  color: getSourceColors(s).textColor,
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: getSourceColors(s).dotColor }} />
                {s}
              </span>
            ))}
          </div>

          {/* カバレッジバー */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-amber-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-400 transition-all duration-700"
                style={{ width: `${coveragePct}%` }}
              />
            </div>
            <span className="text-[10px] font-bold text-amber-600/80 flex-shrink-0 tabular-nums">
              {coveragePct}%
            </span>
          </div>
        </div>

        <span className="text-gray-300 text-xs flex-shrink-0 mt-2">
          {isExpanded ? "▼" : "▶"}
        </span>
      </button>

      {/* 記事一覧 */}
      <div className={`ranking-expand ${isExpanded ? "open" : ""}`}>
        <div>
          <div className="border-t border-amber-100/80 divide-y divide-amber-50/80">
            {group.items.map((item, i) => (
              <div key={i} className="px-5 py-3 flex items-start gap-3 hover:bg-amber-50/60 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[10px] font-semibold" style={{ color: getSourceColors(item.source).textColor }}>
                      {item.source}
                    </span>
                    {item.publishedAt && (
                      <span className="text-[10px] text-gray-400">
                        {formatRelative(item.publishedAt)}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-800 line-clamp-2 leading-snug">{item.title}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => onAnalyze(item)}
                    disabled={item.url === analyzingUrl}
                    className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition-all ${
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
                      className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-purple-50 text-purple-600 hover:bg-purple-100 transition-colors"
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
