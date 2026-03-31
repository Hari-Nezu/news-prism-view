"use client";

import { ALL_YOUTUBE_CHANNELS, CATEGORY_LABELS, DEFAULT_ENABLED_CHANNEL_IDS, type YouTubeChannelConfig } from "@/lib/youtube-channel-configs";

interface Props {
  selected: string[];           // 内部ID の配列
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}

const CATEGORIES: YouTubeChannelConfig["category"][] = ["mainstream", "independent", "commentary"];

export default function YouTubeChannelPanel({ selected, onChange, disabled }: Props) {
  const toggle = (id: string) => {
    onChange(
      selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]
    );
  };

  const selectAll = () => onChange(ALL_YOUTUBE_CHANNELS.map((c) => c.id));
  const selectDefault = () => onChange(DEFAULT_ENABLED_CHANNEL_IDS);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-700">チャンネル選択</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={selectDefault}
            disabled={disabled}
            className="text-[11px] text-purple-600 hover:text-purple-800 disabled:opacity-40"
          >
            デフォルト
          </button>
          <span className="text-gray-200">|</span>
          <button
            type="button"
            onClick={selectAll}
            disabled={disabled}
            className="text-[11px] text-gray-400 hover:text-gray-600 disabled:opacity-40"
          >
            全選択
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {CATEGORIES.map((category) => {
          const channels = ALL_YOUTUBE_CHANNELS.filter((c) => c.category === category);
          return (
            <div key={category}>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                {CATEGORY_LABELS[category]}
              </p>
              <div className="flex flex-wrap gap-2">
                {channels.map((ch) => {
                  const isSelected = selected.includes(ch.id);
                  return (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => toggle(ch.id)}
                      disabled={disabled}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all disabled:opacity-40 ${
                        isSelected
                          ? "bg-red-50 border-red-300 text-red-700"
                          : "bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300"
                      }`}
                    >
                      <span className="text-[10px]">{isSelected ? "✓" : "○"}</span>
                      {ch.name}
                      {ch.leaningHint && (
                        <span className="text-[10px] opacity-60">{ch.leaningHint}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[10px] text-gray-400">
        {selected.length} チャンネル選択中
      </p>
    </div>
  );
}
