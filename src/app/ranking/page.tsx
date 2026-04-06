"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { NewsGroup, RssFeedItem } from "@/types";
import RankingFeedView from "@/components/RankingFeedView";
import OllamaStatus from "@/components/OllamaStatus";
import { loadFeedSettings } from "@/components/FeedSettingsDrawer";
import { ALL_FEED_SOURCES } from "@/lib/config/feed-configs";

/** enabledIds から DB フィルタ用ソース名リストを計算する。
 *  Google News フィードが含まれる場合はフィルタ不可なので null を返す。 */
function resolveEnabledSources(enabledIds: string[], customFeedNames: string[]): string[] | null {
  const enabledFeeds = ALL_FEED_SOURCES.filter((f) => enabledIds.includes(f.id));
  if (enabledFeeds.some((f) => f.type === "google-news")) return null;
  return [
    ...enabledFeeds.map((f) => f.canonicalSource ?? f.name),
    ...customFeedNames,
  ];
}

export default function RankingPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [groupDate,  setGroupDate]  = useState(today);
  const [groups,     setGroups]     = useState<NewsGroup[]>([]);
  const [isGrouping, setIsGrouping] = useState(false);
  const [error,      setError]      = useState("");

  const fetchGroups = useCallback(async (date: string) => {
    const settings = loadFeedSettings();
    const enabledSources = resolveEnabledSources(
      settings.enabledIds,
      settings.customFeeds.map((cf) => cf.name),
    );

    setIsGrouping(true);
    setError("");
    setGroups([]);
    try {
      const res = await fetch("/api/rss/group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetDate: date, enabledSources }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "グループ化に失敗しました");
      setGroups(data.groups ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "グループ化に失敗しました");
    } finally {
      setIsGrouping(false);
    }
  }, []);

  useEffect(() => {
    fetchGroups(today);
  }, [fetchGroups, today]);

  function handleCompareArticle(item: RssFeedItem) {
    window.location.href = `/compare?q=${encodeURIComponent(item.title)}`;
  }

  return (
    <div className="min-h-screen bg-gray-50/80">
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-gray-200/60">
        <div className="mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-lg font-black text-gray-900 tracking-tight hover:opacity-70 transition-opacity">
              NewsPrism
            </Link>
            <span className="text-[11px] text-gray-400 font-medium">まとめ</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <Link
              href="/"
              className="text-xs font-semibold text-gray-600 hover:text-gray-900 transition-colors"
            >
              フィード
            </Link>
            <Link
              href="/compare"
              className="text-xs font-semibold text-purple-600 hover:text-purple-800 transition-colors whitespace-nowrap"
            >
              <span className="sm:hidden">📊</span>
              <span className="hidden sm:inline">📊 メディア比較</span>
            </Link>
            <div className="hidden sm:flex">
              <OllamaStatus />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto px-4 sm:px-6 lg:px-8 py-6 max-w-[900px]">
        {/* 日付ピッカー */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs text-gray-500">対象日:</span>
          <input
            type="date"
            value={groupDate}
            max={today}
            disabled={isGrouping}
            onChange={(e) => {
              setGroupDate(e.target.value);
              fetchGroups(e.target.value);
            }}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-700 focus:outline-none focus:ring-1 focus:ring-amber-300 disabled:opacity-50"
          />
          <span className="text-[10px] text-gray-400">（その日を含む直近3日間）</span>
          <button
            onClick={() => fetchGroups(groupDate)}
            disabled={isGrouping}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors ml-auto"
          >
            {isGrouping
              ? <div className="w-3.5 h-3.5 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
              : <span>↻</span>
            }
            {isGrouping ? "分析中" : "更新"}
          </button>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 mb-4">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {isGrouping ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <div className="w-8 h-8 border-2 border-gray-200 border-t-amber-500 rounded-full animate-spin mb-4" />
            <p className="text-sm">AIでグループ化しています...</p>
          </div>
        ) : (
          <RankingFeedView
            groups={groups}
            analyzedUrls={[]}
            onAnalyze={() => {}}
            onCompareArticle={handleCompareArticle}
          />
        )}
      </main>
    </div>
  );
}
