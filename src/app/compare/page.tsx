"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import OllamaStatus from "@/components/OllamaStatus";
import NewsGroupCard from "@/components/NewsGroupCard";
import MediaComparisonView from "@/components/MediaComparisonView";
import CompareHistory from "@/components/CompareHistory";
import type { CompareStep, NewsGroup, AnalyzedArticle } from "@/types";
import { API_BASE } from "@/lib/api-url";

export default function ComparePage() {
  const [step, setStep] = useState<CompareStep>({ type: "idle" });

  const isBusy = step.type === "analyzing";

  // ── グループ選択 → 逐次分析（SSE） ────────
  const handleSelectGroup = useCallback(async (group: NewsGroup) => {
    setStep({ type: "analyzing", group, progress: 0, total: group.items.length });

    const results: AnalyzedArticle[] = [];

    try {
      const res = await fetch(`${API_BASE}/api/compare/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: group.items.map((i) => ({
          title: i.title,
          url: i.url,
          source: i.source,
          publishedAt: i.publishedAt,
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
              results.push(payload.article as AnalyzedArticle);
              setStep({
                type: "analyzing",
                group,
                progress: results.length,
                total: group.items.length,
              });
            } else if ("total" in payload && !("index" in payload)) {
              setStep({ type: "done", group, results: [...results] });
            }
          } catch {
            // ignore parse errors
          }
        }
      }

      if (results.length > 0) {
        setStep({ type: "done", group, results: [...results] });
      }
    } catch (err) {
      setStep({
        type: "error",
        message: err instanceof Error ? err.message : "分析中にエラーが発生しました",
      });
    }
  }, []);

  const handleReset = () => setStep({ type: "idle" });

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
              <h1 className="text-base sm:text-lg font-black text-gray-900 tracking-tight">
                メディア比較
              </h1>
              <p className="hidden sm:block text-[11px] text-gray-400">同一ニュースの報道色を比較分析</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {step.type !== "idle" && !isBusy && (
              <button
                onClick={handleReset}
                className="px-4 py-2 bg-gray-100 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-200 transition-colors"
              >
                リセット
              </button>
            )}
            <div className="hidden sm:flex">
              <OllamaStatus />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">

        {/* ── グループ選択 ── */}
        {step.type === "grouped" && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-sm text-gray-500">
                  <span className="font-bold text-gray-800 text-base">{step.groups.length}</span>
                  <span className="ml-1">件のニュースグループが見つかりました</span>
                </p>
                <p className="text-xs text-gray-400 mt-0.5">比較したいグループを選択してください</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {step.groups.map((group, i) => (
                <NewsGroupCard
                  key={i}
                  group={group}
                  index={i}
                  onSelect={handleSelectGroup}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── 分析中（進捗） ── */}
        {step.type === "analyzing" && (
          <div className="max-w-lg mx-auto py-12">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-gray-700">各媒体の記事を分析中</p>
                <span className="text-xs text-gray-400 font-mono">{step.progress}/{step.total}</span>
              </div>

              {/* プログレスバー */}
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-4">
                <div
                  className="h-2 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full transition-all duration-500"
                  style={{ width: `${(step.progress / step.total) * 100}%` }}
                />
              </div>

              <p className="text-xs font-medium text-gray-600 mb-3">{step.group.groupTitle}</p>

              {/* 記事ステータス */}
              <div className="space-y-2">
                {step.group.items.map((item, i) => (
                  <div key={i} className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 transition-colors ${
                    i < step.progress
                      ? "bg-green-50 text-green-700"
                      : i === step.progress
                        ? "bg-purple-50 text-purple-700"
                        : "bg-gray-50 text-gray-400"
                  }`}>
                    {i < step.progress ? (
                      <span className="w-4 h-4 rounded-full bg-green-500 text-white text-[10px] flex items-center justify-center font-bold">✓</span>
                    ) : i === step.progress ? (
                      <div className="w-4 h-4 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin" />
                    ) : (
                      <span className="w-4 h-4 rounded-full border-2 border-gray-200" />
                    )}
                    <span className="font-medium">{item.source}</span>
                    <span className="truncate">{item.title.slice(0, 30)}...</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── 分析完了 ── */}
        {step.type === "done" && (
          <div>
            <div className="flex items-center gap-3 mb-6">
              <button
                onClick={() => setStep({ type: "grouped", groups: [] })}
                className="text-sm text-purple-600 hover:text-purple-800 font-medium transition-colors"
              >
                ← 別のグループを比較
              </button>
              <span className="text-gray-300">|</span>
              <button
                onClick={handleReset}
                className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
              >
                履歴に戻る
              </button>
            </div>
            <MediaComparisonView group={step.group} results={step.results} />
          </div>
        )}

        {/* ── エラー ── */}
        {step.type === "error" && (
          <div className="max-w-lg mx-auto mt-4">
            <div className="rounded-2xl bg-red-50 border border-red-200 px-5 py-4">
              <p className="text-sm font-semibold text-red-700 mb-1">エラーが発生しました</p>
              <p className="text-xs text-red-600">{step.message}</p>
              <button
                onClick={handleReset}
                className="mt-3 text-xs font-medium text-red-600 hover:text-red-800 transition-colors"
              >
                リセットして再試行 →
              </button>
            </div>
          </div>
        )}

        {/* ── 初期状態: 履歴から復元 ── */}
        {step.type === "idle" && (
          <CompareHistory onRestore={(kw, groups) => {
            void kw;
            setStep({ type: "grouped", groups });
          }} />
        )}
      </main>
    </div>
  );
}
