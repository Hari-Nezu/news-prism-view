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
}

export default function RankingHeroCard({
  group, totalSourceCount, isExpanded, onToggleExpand,
  analyzedUrls, analyzingUrl, onAnalyze, onCompareArticle,
}: Props) {
  const sources = [...new Set(group.items.map((i) => i.source))];
  const coveragePct = totalSourceCount > 0
    ? Math.round((sources.length / totalSourceCount) * 100)
    : 0;

  return (
    <div className="rounded-2xl border-2 border-amber-200 bg-gradient-to-br from-amber-50 to-white shadow-lg overflow-hidden ranking-hero">
      <button
        className="w-full flex items-start gap-3 px-5 py-4 hover:bg-amber-50/60 transition-colors text-left"
        onClick={onToggleExpand}
      >
        {/* ランクバッジ */}
        <span className="w-9 h-9 rounded-full bg-amber-500 text-white font-black text-base flex items-center justify-center flex-shrink-0 shadow-sm">
          🥇
        </span>

        <div className="flex-1 min-w-0">
          {/* メタ */}
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-bold text-amber-700">{group.items.length}件</span>
            <span className="text-xs text-amber-600">{sources.length}媒体が報道</span>
          </div>

          {/* タイトル */}
          <p className="text-lg font-bold text-gray-900 line-clamp-2 leading-snug mb-3">
            {group.groupTitle}
          </p>

          {/* カバレッジバー */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 rounded-full bg-amber-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-amber-400 transition-all duration-700"
                style={{ width: `${coveragePct}%` }}
              />
            </div>
            <span className="text-[10px] font-bold text-amber-600 flex-shrink-0">
              {coveragePct}%
            </span>
          </div>
        </div>

        <span className="text-gray-400 text-sm flex-shrink-0 mt-1">
          {isExpanded ? "▼" : "▶"}
        </span>
      </button>

      {/* 記事一覧 */}
      <div className={`ranking-expand ${isExpanded ? "open" : ""}`}>
        <div>
          <div className="border-t border-amber-100 divide-y divide-amber-50">
            {group.items.map((item, i) => (
              <div key={i} className="px-5 py-3 flex items-start gap-3 hover:bg-amber-50 transition-colors">
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
