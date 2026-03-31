"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import OllamaStatus from "@/components/OllamaStatus";
import YouTubeChannelPanel from "@/components/YouTubeChannelPanel";
import ScoreCard from "@/components/ScoreCard";
import PositioningPlot from "@/components/PositioningPlot";
import { DEFAULT_ENABLED_CHANNEL_IDS } from "@/lib/youtube-channel-configs";
import type { AnalyzedArticle, MultiModelAnalyzedArticle, RssFeedItem } from "@/types";

type YouTubeStep =
  | { type: "idle" }
  | { type: "fetching" }
  | { type: "fetched"; items: RssFeedItem[] }
  | { type: "analyzing"; progress: number; total: number; items: RssFeedItem[] }
  | { type: "done"; results: MultiModelAnalyzedArticle[] }
  | { type: "error"; message: string };

export default function YouTubePage() {
  const [selectedChannels, setSelectedChannels] = useState<string[]>(DEFAULT_ENABLED_CHANNEL_IDS);
  const [step, setStep] = useState<YouTubeStep>({ type: "idle" });
  const [selectedIndex, setSelectedIndex] = useState<number | undefined>(undefined);

  const isBusy = step.type === "fetching" || step.type === "analyzing";

  // ── フェーズ1: フィード取得 ────────────────────────────
  const handleFetch = useCallback(async () => {
    if (selectedChannels.length === 0) return;
    setStep({ type: "fetching" });

    try {
      const res = await fetch(
        `/api/youtube/feed?channels=${encodeURIComponent(selectedChannels.join(","))}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (data.items.length === 0) {
        setStep({ type: "error", message: "動画が見つかりませんでした。チャンネルIDが正しいか確認してください。" });
        return;
      }

      setStep({ type: "fetched", items: data.items });
    } catch (err) {
      setStep({ type: "error", message: err instanceof Error ? err.message : "フェッチエラー" });
    }
  }, [selectedChannels]);

  // ── フェーズ2: 一括分析（SSE） ─────────────────────────
  const handleAnalyze = useCallback(async (items: RssFeedItem[]) => {
    setStep({ type: "analyzing", progress: 0, total: items.length, items });

    const results: MultiModelAnalyzedArticle[] = [];

    try {
      const res = await fetch("/api/youtube/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: items.map((i) => ({
          title:       i.title,
          url:         i.url,
          source:      i.source,
          summary:     i.summary,
          publishedAt: i.publishedAt,
          imageUrl:    i.imageUrl,
        })) }),
      });

      if (!res.ok || !res.body) throw new Error("分析APIへの接続に失敗しました");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("event: ")) continue;
          if (!line.startsWith("data: ")) continue;

          try {
            const payload = JSON.parse(line.slice(6));
            if ("article" in payload) {
              const article = payload.article as AnalyzedArticle & { transcriptType?: string };
              results.push(article as MultiModelAnalyzedArticle);
              setStep((prev) =>
                prev.type === "analyzing"
                  ? { ...prev, progress: results.length }
                  : prev
              );
            } else if ("total" in payload && !("index" in payload)) {
              setStep({ type: "done", results: [...results] });
            }
          } catch {
            // ignore parse errors
          }
        }
      }

      if (results.length > 0) {
        setStep({ type: "done", results: [...results] });
      }
    } catch (err) {
      setStep({
        type: "error",
        message: err instanceof Error ? err.message : "分析中にエラーが発生しました",
      });
    }
  }, []);

  const handleReset = () => {
    setStep({ type: "idle" });
    setSelectedIndex(undefined);
  };

  return (
    <div className="min-h-screen bg-gray-50/80">
      {/* ヘッダー */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-gray-200/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/"
              className="text-sm text-gray-400 hover:text-gray-600 transition-colors whitespace-nowrap"
            >
              ← <span className="hidden sm:inline">ホーム</span>
            </Link>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-black text-gray-900 tracking-tight flex items-center gap-2">
                <span className="text-red-500">▶</span> YouTube 分析
              </h1>
              <p className="hidden sm:block text-[11px] text-gray-400">チャンネルの動画を字幕で政治ポジション分析</p>
            </div>
          </div>
          <div className="hidden sm:flex">
            <OllamaStatus />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* チャンネル選択 + 取得ボタン */}
        {(step.type === "idle" || step.type === "fetched" || step.type === "error") && (
          <div className="space-y-4">
            <YouTubeChannelPanel
              selected={selectedChannels}
              onChange={setSelectedChannels}
              disabled={isBusy}
            />

            <div className="flex gap-3">
              <button
                onClick={handleFetch}
                disabled={selectedChannels.length === 0 || isBusy}
                className="px-6 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-xl disabled:opacity-40 hover:bg-red-700 transition-colors shadow-sm"
              >
                最新動画を取得
              </button>
              {step.type !== "idle" && (
                <button
                  onClick={handleReset}
                  className="px-5 py-2.5 bg-gray-100 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-200 transition-colors"
                >
                  リセット
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── 取得中 ── */}
        {step.type === "fetching" && (
          <div className="flex flex-col items-center gap-4 py-16">
            <div className="relative w-12 h-12">
              <div className="w-12 h-12 border-4 border-red-100 rounded-full" />
              <div className="absolute inset-0 w-12 h-12 border-4 border-transparent border-t-red-600 rounded-full animate-spin" />
            </div>
            <p className="text-sm font-semibold text-gray-700">YouTubeフィードを取得中...</p>
          </div>
        )}

        {/* ── 動画一覧（分析前） ── */}
        {step.type === "fetched" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-600">
                <span className="font-bold text-gray-800 text-base">{step.items.length}</span>
                <span className="ml-1">本の動画を取得しました</span>
              </p>
              <button
                onClick={() => handleAnalyze(step.items)}
                className="px-5 py-2 bg-purple-600 text-white text-sm font-semibold rounded-xl hover:bg-purple-700 transition-colors shadow-sm"
              >
                全動画を分析
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {step.items.map((item, i) => (
                <div
                  key={i}
                  className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden"
                >
                  {item.imageUrl && (
                    <img
                      src={item.imageUrl}
                      alt={item.title}
                      className="w-full aspect-video object-cover"
                    />
                  )}
                  <div className="p-3">
                    <p className="text-xs font-semibold text-red-600 mb-1">{item.source}</p>
                    <p className="text-sm text-gray-800 font-medium leading-snug line-clamp-2">
                      {item.title}
                    </p>
                    {item.publishedAt && (
                      <p className="text-[10px] text-gray-400 mt-1">
                        {new Date(item.publishedAt).toLocaleDateString("ja-JP")}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 分析中 ── */}
        {step.type === "analyzing" && (
          <div className="max-w-lg mx-auto py-8">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-gray-700">動画を字幕で分析中...</p>
                <span className="text-xs text-gray-400 font-mono">{step.progress}/{step.total}</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-4">
                <div
                  className="h-2 bg-gradient-to-r from-red-500 to-purple-500 rounded-full transition-all duration-500"
                  style={{ width: `${(step.progress / step.total) * 100}%` }}
                />
              </div>
              <p className="text-xs text-gray-500">字幕取得 → Ollama分析 → 次の動画（1秒間隔）</p>
            </div>
          </div>
        )}

        {/* ── 分析完了 ── */}
        {step.type === "done" && (
          <div>
            <div className="flex items-center gap-3 mb-6">
              <button
                onClick={handleReset}
                className="text-sm text-red-600 hover:text-red-800 font-medium transition-colors"
              >
                ← 別のチャンネルを選択
              </button>
            </div>

            {/* プロット */}
            <div className="mb-6">
              <PositioningPlot
                articles={step.results}
                selectedIndex={selectedIndex}
                onSelect={setSelectedIndex}
              />
            </div>

            {/* スコアカード */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {step.results.map((article, i) => (
                <ScoreCard
                  key={i}
                  article={article}
                  index={i}
                  highlighted={i === selectedIndex}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── エラー ── */}
        {step.type === "error" && (
          <div className="max-w-lg">
            <div className="rounded-2xl bg-red-50 border border-red-200 px-5 py-4">
              <p className="text-sm font-semibold text-red-700 mb-1">エラーが発生しました</p>
              <p className="text-xs text-red-600">{step.message}</p>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
