"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { RssFeedItem, NewsGroup, GroupMode } from "@/types";
import { getSourceColors } from "@/lib/source-colors";
import { getTopicDef, type TopicId } from "@/lib/topic-classifier";
import FeedSettingsDrawer, {
  loadFeedSettings,
  saveFeedSettings,
  type FeedSettings,
} from "./FeedSettingsDrawer";
import RankingFeedView from "./RankingFeedView";

interface Props {
  onAnalyze: (item: RssFeedItem) => void;
  onCompare?: () => void;
  onCompareArticle?: (item: RssFeedItem) => void;
  analyzedUrls?: string[];
  analyzingUrl?: string;
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return "今";
  if (mins < 60) return `${mins}分前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}時間前`;
  return `${Math.floor(hours / 24)}日前`;
}

// ── コンパクト記事カード（カラム内用） ────────────────────

interface CardProps {
  item: RssFeedItem;
  isAnalyzed: boolean;
  isAnalyzing: boolean;
  onAnalyze: () => void;
  onCompareArticle?: () => void;
}

function ArticleCard({ item, isAnalyzed, isAnalyzing, onAnalyze, onCompareArticle }: CardProps) {
  const c = getSourceColors(item.source);
  return (
    <article
      className={`bg-white rounded-xl border overflow-hidden transition-all duration-200 hover:shadow-md ${
        isAnalyzed
          ? "border-blue-200 shadow-sm shadow-blue-50"
          : isAnalyzing
            ? "border-blue-300 ring-2 ring-blue-100"
            : "border-gray-200 hover:border-gray-300"
      }`}
    >
      {/* カラーバー + サムネイル */}
      {item.imageUrl ? (
        <div className="relative h-28 overflow-hidden">
          <img
            src={item.imageUrl}
            alt=""
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).closest("div")!.style.display = "none";
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/30" />
        </div>
      ) : (
        <div
          className="h-1.5 w-full"
          style={{ backgroundColor: c.dotColor }}
        />
      )}

      <div className="p-3">
        {/* メタ */}
        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
          <span
            className="inline-flex items-center gap-1 text-[10px] font-semibold"
            style={{ color: c.textColor }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c.dotColor }} />
            {item.source}
          </span>
          {item.publishedAt && (
            <span className="text-[10px] text-gray-400">{relativeTime(item.publishedAt)}</span>
          )}
          {isAnalyzed && (
            <span className="text-[9px] font-bold bg-blue-600 text-white px-1.5 py-0.5 rounded-full">
              分析済
            </span>
          )}
          {isAnalyzing && (
            <span className="text-[9px] font-bold bg-blue-500 text-white px-1.5 py-0.5 rounded-full animate-pulse">
              分析中...
            </span>
          )}
        </div>

        {/* タイトル */}
        <h3
          className={`text-[13px] font-bold leading-snug mb-2 line-clamp-3 ${
            isAnalyzed ? "text-blue-900" : "text-gray-900"
          }`}
        >
          {item.title}
        </h3>

        {/* アクション */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={onAnalyze}
            disabled={isAnalyzing}
            className={`flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition-all ${
              isAnalyzing
                ? "bg-blue-100 text-blue-400 cursor-wait"
                : isAnalyzed
                  ? "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            {isAnalyzing
              ? <div className="w-2.5 h-2.5 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
              : <span>🔍</span>
            }
            {isAnalyzing ? "分析中" : isAnalyzed ? "結果" : "3軸分析"}
          </button>

          {onCompareArticle && (
            <button
              onClick={onCompareArticle}
              title="同一ニュースを各媒体で比較"
              className="flex items-center gap-0.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-purple-50 text-purple-600 hover:bg-purple-100 transition-colors"
            >
              <span>📊</span>
              比較
            </button>
          )}

          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors ml-auto"
              onClick={(e) => e.stopPropagation()}
            >
              ↗
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

// ── メインコンポーネント ──────────────────────────────────

export default function RssFeedPanel({ onAnalyze, onCompare, onCompareArticle, analyzedUrls = [], analyzingUrl }: Props) {
  const [items,        setItems]        = useState<RssFeedItem[]>([]);
  const [isLoading,    setIsLoading]    = useState(false);
  const [error,        setError]        = useState("");
  const [activeSource, setActiveSource] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settings,     setSettings]     = useState<FeedSettings>({
    enabledIds:    [],
    customFeeds:   [],
    visibleTopics: [],
  });

  // グループ表示モード
  const [groupMode,     setGroupMode]     = useState<GroupMode>("off");
  const groupModeRef = useRef<GroupMode>("off");
  groupModeRef.current = groupMode; // レンダリングのたびに同期
  const [groups,        setGroups]        = useState<NewsGroup[]>([]);
  const [isGrouping,    setIsGrouping]    = useState(false);
  const [groupError,    setGroupError]    = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());

  useEffect(() => {
    setSettings(loadFeedSettings());
  }, []);

  const groupItems = useCallback(async (targetItems: RssFeedItem[]) => {
    setIsGrouping(true);
    setGroupError("");
    setGroups([]);
    setExpandedGroups(new Set());
    try {
      const res = await fetch("/api/rss/group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: targetItems }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "グループ化に失敗しました");
      setGroups(data.groups ?? []);
      setExpandedGroups(new Set([0]));
    } catch (e) {
      setGroupError(e instanceof Error ? e.message : "グループ化に失敗しました");
    } finally {
      setIsGrouping(false);
    }
  }, []);

  const loadFeeds = useCallback(async (currentSettings: FeedSettings) => {
    setIsLoading(true);
    setError("");
    try {
      const requests: Promise<RssFeedItem[]>[] = [];

      if (currentSettings.enabledIds.length > 0) {
        requests.push(
          fetch(`/api/rss?enabledIds=${currentSettings.enabledIds.join(",")}`)
            .then((r) => r.json())
            .then((d) => (Array.isArray(d.items) ? d.items : []))
        );
      }

      for (const cf of currentSettings.customFeeds) {
        requests.push(
          fetch(`/api/rss?feedUrl=${encodeURIComponent(cf.url)}&feedName=${encodeURIComponent(cf.name)}`)
            .then((r) => r.json())
            .then((d) => (Array.isArray(d.items) ? d.items : []))
        );
      }

      if (requests.length === 0) { setItems([]); return; }

      const results = await Promise.allSettled(requests);
      const allItems = results
        .filter((r): r is PromiseFulfilledResult<RssFeedItem[]> => r.status === "fulfilled")
        .flatMap((r) => r.value);

      const seen = new Set<string>();
      const deduped = allItems.filter((item) => {
        if (!item.url || seen.has(item.url)) return false;
        seen.add(item.url);
        return true;
      });
      deduped.sort((a, b) => {
        const da = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
        const db = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
        return db - da;
      });
      setItems(deduped);
      if (groupModeRef.current === "ranking") {
        groupItems(deduped);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "RSSの取得に失敗しました");
    } finally {
      setIsLoading(false);
    }
  }, [groupItems]);

  useEffect(() => {
    if (settings.enabledIds.length > 0 || settings.customFeeds.length > 0) {
      loadFeeds(settings);
    }
  }, [settings, loadFeeds]);

  function handleSettingsChange(next: FeedSettings) {
    setSettings(next);
    saveFeedSettings(next);
  }

  function handleGroupToggle() {
    const next: GroupMode = groupMode === "off" ? "ranking" : "off";
    setGroupMode(next);
    if (next === "ranking" && groups.length === 0 && items.length > 0) {
      groupItems(items);
    }
  }

  function toggleGroupExpand(index: number) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
  }

  // ソースフィルタ適用済みアイテム
  const sourceFiltered = activeSource
    ? items.filter((item) => item.source === activeSource)
    : items;

  const sources = [...new Set(items.map((item) => item.source))];

  // カラム定義（visibleTopics が空なら統合ビュー）
  const visibleTopics = settings.visibleTopics;
  const columns = visibleTopics.map((topicId) => ({
    topicId: topicId as TopicId,
    def: getTopicDef(topicId as TopicId),
    items: sourceFiltered.filter((item) => (item.topic ?? "other") === topicId),
  }));

  const isColumnView = columns.length > 0;
  const unifiedItems = sourceFiltered; // カラムなしのとき全表示

  return (
    <div className="w-full">
      {/* ツールバー */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-gray-900">ニュースフィード</h2>
          {items.length > 0 && (
            <span className="text-xs font-medium bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
              {items.length}件
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onCompare && (
            <button
              onClick={onCompare}
              className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-purple-200 text-purple-600 hover:bg-purple-50 transition-colors"
            >
              <span className="text-xs">📊</span>
              媒体比較
            </button>
          )}
          <button
            onClick={handleGroupToggle}
            disabled={isGrouping || items.length === 0}
            title="同一ニュースイベントごとにグループ化"
            className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
              groupMode !== "off"
                ? "bg-amber-50 border-amber-300 text-amber-700"
                : "border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {isGrouping
              ? <div className="w-3.5 h-3.5 border-2 border-amber-300 border-t-amber-600 rounded-full animate-spin" />
              : <span className="text-xs">🏆</span>
            }
            {isGrouping ? "AIで分析中..." : groupMode === "ranking" ? "ランキング表示中" : "まとめ表示"}
          </button>
          <button
            onClick={() => loadFeeds(settings)}
            disabled={isLoading}
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {isLoading
              ? <div className="w-3.5 h-3.5 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
              : <span className="text-xs">↻</span>
            }
            {isLoading ? "読込中" : "更新"}
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
            aria-label="フィード設定"
            title="フィード設定"
          >
            ⚙
          </button>
        </div>
      </div>

      {/* ソースフィルター */}
      {sources.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          <button
            onClick={() => setActiveSource(null)}
            className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              activeSource === null ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            すべて
          </button>
          {sources.map((source) => {
            const c = getSourceColors(source);
            const isActive = activeSource === source;
            return (
              <button
                key={source}
                onClick={() => setActiveSource(isActive ? null : source)}
                className="flex-shrink-0 flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors"
                style={isActive ? { backgroundColor: "#111827", color: "#fff" } : { backgroundColor: c.bgColor, color: c.textColor }}
              >
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: isActive ? "#fff" : c.dotColor }} />
                {source}
              </button>
            );
          })}
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 mb-4">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* ── ランキング表示モード ── */}
      {groupMode === "ranking" ? (
        <div>
          {groupError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 mb-3">
              <p className="text-sm text-red-600">{groupError}</p>
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
              totalSourceCount={sources.length}
              analyzedUrls={analyzedUrls}
              analyzingUrl={analyzingUrl}
              onAnalyze={onAnalyze}
              onCompareArticle={onCompareArticle}
            />
          )}
        </div>
      ) : /* ── マルチカラムビュー ── */
      isColumnView ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 items-start">
          {columns.map(({ topicId, def, items: colItems }) => (
            <div key={topicId} className="flex flex-col min-w-0">
              {/* カラムヘッダー */}
              <div className="flex items-center gap-2 mb-3 px-1">
                <span className="text-base">{def.icon}</span>
                <span className="text-sm font-bold text-gray-800">{def.label}</span>
                <span className="text-[10px] font-medium bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full ml-auto">
                  {colItems.length}
                </span>
              </div>

              {/* 記事リスト（md以上で独立スクロール） */}
              <div className="space-y-3 md:overflow-y-auto md:pr-1 md:max-h-[calc(100vh-240px)]">
                {colItems.map((item, i) => (
                  <ArticleCard
                    key={`${item.url}-${i}`}
                    item={item}
                    isAnalyzed={item.url ? analyzedUrls.includes(item.url) : false}
                    isAnalyzing={item.url === analyzingUrl}
                    onAnalyze={() => onAnalyze(item)}
                    onCompareArticle={onCompareArticle ? () => onCompareArticle(item) : undefined}
                  />
                ))}
                {colItems.length === 0 && !isLoading && (
                  <div className="flex flex-col items-center justify-center py-8 text-gray-300">
                    <p className="text-xl mb-1">{def.icon}</p>
                    <p className="text-xs">記事なし</p>
                  </div>
                )}
                {isLoading && colItems.length === 0 && (
                  <div className="flex justify-center py-8">
                    <div className="w-5 h-5 border-2 border-gray-200 border-t-blue-400 rounded-full animate-spin" />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ── 統合ビュー（visibleTopics が空のとき） ── */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
          {unifiedItems.map((item, i) => (
            <ArticleCard
              key={`${item.url}-${i}`}
              item={item}
              isAnalyzed={item.url ? analyzedUrls.includes(item.url) : false}
              isAnalyzing={item.url === analyzingUrl}
              onAnalyze={() => onAnalyze(item)}
              onCompareArticle={onCompareArticle ? () => onCompareArticle(item) : undefined}
            />
          ))}
          {isLoading && unifiedItems.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <div className="w-8 h-8 border-3 border-gray-200 border-t-blue-500 rounded-full animate-spin mb-4" />
              <p className="text-sm">ニュースを読み込んでいます...</p>
            </div>
          )}
          {!isLoading && unifiedItems.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <p className="text-3xl mb-3">📰</p>
              <p className="text-sm">ニュースフィードが見つかりませんでした</p>
            </div>
          )}
        </div>
      )}

      {showSettings && (
        <FeedSettingsDrawer
          settings={settings}
          onSettingsChange={handleSettingsChange}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
