"use client";

import { useEffect, useRef } from "react";
import {
  ALL_FEED_SOURCES,
  DEFAULT_ENABLED_IDS,
  groupFeedsByCategory,
  type FeedConfig,
} from "@/lib/config/feed-configs";
import { TOPICS, TOPIC_ORDER } from "@/lib/topic-classifier";

// ── localStorage 型 ───────────────────────────────────────

export interface CustomFeedEntry {
  id: string;
  name: string;
  url: string;
}

export interface FeedSettings {
  enabledIds: string[];
  customFeeds: CustomFeedEntry[];
  /** タブとして表示するトピックID（設定で変更可） */
  visibleTopics: string[];
}

// デフォルトで表示するトピック（カラムとして並べるもの）
export const DEFAULT_VISIBLE_TOPICS = ["politics", "economy", "science_tech"];

const STORAGE_KEY = "newsprism:feed-settings";

export function loadFeedSettings(): FeedSettings {
  if (typeof window === "undefined") {
    return { enabledIds: DEFAULT_ENABLED_IDS, customFeeds: [], visibleTopics: DEFAULT_VISIBLE_TOPICS };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { enabledIds: DEFAULT_ENABLED_IDS, customFeeds: [], visibleTopics: DEFAULT_VISIBLE_TOPICS };
    const parsed = JSON.parse(raw) as Partial<FeedSettings>;
    return {
      enabledIds:    Array.isArray(parsed.enabledIds)    ? parsed.enabledIds    : DEFAULT_ENABLED_IDS,
      customFeeds:   Array.isArray(parsed.customFeeds)   ? parsed.customFeeds   : [],
      visibleTopics: Array.isArray(parsed.visibleTopics) ? parsed.visibleTopics : DEFAULT_VISIBLE_TOPICS,
    };
  } catch {
    return { enabledIds: DEFAULT_ENABLED_IDS, customFeeds: [], visibleTopics: DEFAULT_VISIBLE_TOPICS };
  }
}

export function saveFeedSettings(settings: FeedSettings): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

// ── コンポーネント ────────────────────────────────────────

interface Props {
  settings: FeedSettings;
  onSettingsChange: (next: FeedSettings) => void;
  onClose: () => void;
}

export default function FeedSettingsDrawer({ settings, onSettingsChange, onClose }: Props) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const customNameRef = useRef<HTMLInputElement>(null);
  const customUrlRef  = useRef<HTMLInputElement>(null);

  // ESC キーで閉じる
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  function toggleFeed(id: string) {
    const next = settings.enabledIds.includes(id)
      ? settings.enabledIds.filter((x) => x !== id)
      : [...settings.enabledIds, id];
    const updated = { ...settings, enabledIds: next };
    saveFeedSettings(updated);
    onSettingsChange(updated);
  }

  function toggleTopicVisible(id: string) {
    const next = settings.visibleTopics.includes(id)
      ? settings.visibleTopics.filter((x) => x !== id)
      : [...settings.visibleTopics, id];
    const updated: FeedSettings = {
      ...settings,
      visibleTopics: next,
    };
    saveFeedSettings(updated);
    onSettingsChange(updated);
  }

  function addCustomFeed() {
    const name = customNameRef.current?.value.trim();
    const url  = customUrlRef.current?.value.trim();
    if (!name || !url) return;
    try { new URL(url); } catch { alert("有効な URL を入力してください"); return; }

    const entry: CustomFeedEntry = {
      id:   `custom-${Date.now()}`,
      name,
      url,
    };
    const updated: FeedSettings = {
      ...settings,
      customFeeds: [...settings.customFeeds, entry],
    };
    saveFeedSettings(updated);
    onSettingsChange(updated);
    if (customNameRef.current) customNameRef.current.value = "";
    if (customUrlRef.current)  customUrlRef.current.value  = "";
  }

  function removeCustomFeed(id: string) {
    const updated: FeedSettings = {
      ...settings,
      customFeeds: settings.customFeeds.filter((f) => f.id !== id),
    };
    saveFeedSettings(updated);
    onSettingsChange(updated);
  }

  function resetDefaults() {
    const updated: FeedSettings = {
      enabledIds: DEFAULT_ENABLED_IDS,
      customFeeds: [],
      visibleTopics: DEFAULT_VISIBLE_TOPICS,
    };
    saveFeedSettings(updated);
    onSettingsChange(updated);
  }

  const grouped = groupFeedsByCategory();

  return (
    <>
      {/* オーバーレイ */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* ドロワー本体 */}
      <div
        ref={drawerRef}
        className="fixed right-0 top-0 bottom-0 z-50 w-80 bg-white shadow-2xl flex flex-col overflow-hidden"
        role="dialog"
        aria-label="フィード設定"
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-900">フィード設定</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>

        {/* スクロール領域 */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* ── トピックフィルター設定 ── */}
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
              表示トピック
            </p>
            <p className="text-[10px] text-gray-400 mb-2">
              フィードに表示するトピックタブを選択
            </p>
            <div className="flex flex-wrap gap-2">
              {TOPIC_ORDER.map((id) => {
                const topic = TOPICS[id];
                const visible = settings.visibleTopics.includes(id);
                return (
                  <button
                    key={id}
                    onClick={() => toggleTopicVisible(id)}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                      visible
                        ? "bg-gray-800 text-white border-gray-800"
                        : "bg-white text-gray-400 border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <span>{topic.icon}</span>
                    {topic.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── プリセットフィード ── */}
          {Object.entries(grouped).map(([category, feeds]) => (
            <div key={category}>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                {category}
              </p>
              <div className="space-y-1.5">
                {feeds.map((feed: FeedConfig) => {
                  const enabled = settings.enabledIds.includes(feed.id);
                  return (
                    <label
                      key={feed.id}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      {/* トグル */}
                      <button
                        role="switch"
                        aria-checked={enabled}
                        onClick={() => toggleFeed(feed.id)}
                        className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 focus:outline-none ${
                          enabled ? "bg-blue-500" : "bg-gray-200"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                            enabled ? "translate-x-4" : "translate-x-0.5"
                          }`}
                        />
                      </button>
                      <span className="text-sm text-gray-700 leading-tight">{feed.name}</span>
                      {feed.type === "google-news" && (
                        <span className="ml-auto text-[9px] font-semibold text-blue-400 bg-blue-50 px-1.5 py-0.5 rounded-full flex-shrink-0">
                          G
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}

          {/* ── カスタムフィード ── */}
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
              カスタムフィード
            </p>

            {settings.customFeeds.length > 0 && (
              <div className="space-y-1.5 mb-3">
                {settings.customFeeds.map((cf) => (
                  <div key={cf.id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50">
                    <span className="flex-1 text-xs text-gray-700 truncate">{cf.name}</span>
                    <button
                      onClick={() => removeCustomFeed(cf.id)}
                      className="text-gray-300 hover:text-red-400 transition-colors text-xs leading-none"
                      aria-label={`${cf.name} を削除`}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* 追加フォーム */}
            <div className="space-y-2 p-3 rounded-xl border border-dashed border-gray-200 bg-gray-50/50">
              <input
                ref={customNameRef}
                type="text"
                placeholder="媒体名（例: ロイター）"
                className="w-full text-xs text-gray-900 px-3 py-2 rounded-lg border border-gray-300 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
              <input
                ref={customUrlRef}
                type="url"
                placeholder="RSS URL（https://...）"
                className="w-full text-xs text-gray-900 px-3 py-2 rounded-lg border border-gray-300 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
              <button
                onClick={addCustomFeed}
                className="w-full text-xs font-semibold py-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors"
              >
                + 追加
              </button>
            </div>
          </div>
        </div>

        {/* フッター */}
        <div className="px-5 py-3 border-t border-gray-100">
          <button
            onClick={resetDefaults}
            className="w-full text-xs text-gray-400 hover:text-gray-600 transition-colors py-1.5"
          >
            デフォルトに戻す
          </button>
        </div>
      </div>
    </>
  );
}
