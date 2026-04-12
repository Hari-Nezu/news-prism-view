"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import OllamaStatus from "@/components/OllamaStatus";
import NewsGroupCard from "@/components/NewsGroupCard";
import MediaComparisonView from "@/components/MediaComparisonView";
import CompareHistory from "@/components/CompareHistory";
import type { CompareStep, NewsGroup, AnalyzedArticle } from "@/types";
import { API_BASE } from "@/lib/api-url";

const SUGGESTED_KEYWORDS = ["防衛費", "原発", "少子化対策", "日銀", "外交", "半導体"];

export default function ComparePage() {
  const [keyword, setKeyword] = useState("");
  const [step, setStep] = useState<CompareStep>({ type: "idle" });

  const isBusy = step.type === "fetching" || step.type === "grouping" || step.type === "analyzing";

  // URL の ?q= パラメータからシード記事タイトルを受け取り自動検索
  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search).get("q");
    if (!q) return;
    // URL をクリーン（ブラウザ履歴に残さない）
    window.history.replaceState(null, "", "/compare");
    setKeyword(q);
    handleSearch(q);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── フェーズ1: RSS収集 + グループ化 ──────────────────
  const handleSearch = useCallback(async (searchKeyword?: string) => {
    const kw = (searchKeyword ?? keyword).trim();
    if (!kw) return;
    if (searchKeyword) setKeyword(kw);

    setStep({ type: "fetching" });
    try {
      setStep({ type: "grouping" });
      const res = await fetch(`${API_BASE}/api/compare?keyword=${encodeURIComponent(kw)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (data.groups.length === 0) {
        setStep({
          type: "error",
          message: `「${kw}」に合致する記事が見つかりませんでした（全${data.totalFetched}件中）。別のキーワードをお試しください。`,
        });
        return;
      }

      setStep({ type: "grouped", groups: data.groups });
    } catch (err) {
      setStep({ type: "error", message: err instanceof Error ? err.message : "エラーが発生しました" });
    }
  }, [keyword]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch();
  };

  // ── フェーズ2: グループ選択 → 逐次分析（SSE） ────────
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
          <div className="hidden sm:flex">
            <OllamaStatus />
          </div>
        </div>
      </header>

      {/* 検索バー */}
      <div className="bg-white border-b border-gray-100">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto px-4 sm:px-6 py-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="キーワードを入力して比較検索..."
                className="w-full text-sm text-gray-900 border border-gray-300 rounded-xl pl-9 pr-4 py-2.5 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-300 focus:border-purple-400 transition-all"
                disabled={isBusy}
              />
            </div>
            <button
              type="submit"
              disabled={!keyword.trim() || isBusy}
              className="px-5 py-2.5 bg-purple-600 text-white text-sm font-semibold rounded-xl disabled:opacity-40 hover:bg-purple-700 transition-colors shadow-sm"
            >
              検索
            </button>
            {step.type !== "idle" && (
              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-2.5 bg-gray-100 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-200 transition-colors"
              >
                リセット
              </button>
            )}
          </div>
        </form>
      </div>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">

        {/* ── ローディング ── */}
        {(step.type === "fetching" || step.type === "grouping") && (
          <div className="flex flex-col items-center gap-5 py-20">
            <div className="relative">
              <div className="w-14 h-14 border-4 border-purple-100 rounded-full" />
              <div className="absolute inset-0 w-14 h-14 border-4 border-transparent border-t-purple-600 rounded-full animate-spin" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-700 mb-1">
                {step.type === "fetching" ? "RSS記事を収集中..." : "同一ニュースを判定中..."}
              </p>
              <p className="text-xs text-gray-400">Ollamaが記事をグループ化しています</p>
            </div>
            {/* ステップインジケーター */}
            <div className="flex items-center gap-3 text-xs">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${
                step.type === "fetching" ? "bg-purple-100 text-purple-700 font-semibold" : "bg-green-100 text-green-700"
              }`}>
                {step.type !== "fetching" && <span>✓</span>}
                <span>RSS収集</span>
              </div>
              <span className="text-gray-300">→</span>
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${
                step.type === "grouping" ? "bg-purple-100 text-purple-700 font-semibold" : "bg-gray-100 text-gray-400"
              }`}>
                <span>グループ化</span>
              </div>
            </div>
          </div>
        )}

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
                別のキーワードで検索
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

        {/* ── 初期状態 ── */}
        {step.type === "idle" && (
          <div>
            {/* 検索履歴 */}
            <div className="mb-8">
              <CompareHistory onRestore={(kw, groups) => {
                setKeyword(kw);
                setStep({ type: "grouped", groups });
              }} />
            </div>

            {/* ガイド */}
            <div className="text-center py-12">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-purple-50 mb-4">
                <span className="text-3xl">📊</span>
              </div>
              <p className="text-base font-semibold text-gray-700 mb-1">キーワードを入力して比較検索</p>
              <p className="text-sm text-gray-400 mb-6">
                複数メディアが同じニュースをどう報じているかを比較します
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {SUGGESTED_KEYWORDS.map((kw) => (
                  <button
                    key={kw}
                    onClick={() => handleSearch(kw)}
                    className="text-sm px-4 py-2 rounded-xl border border-gray-200 bg-white hover:border-purple-300 hover:text-purple-600 hover:shadow-sm transition-all"
                  >
                    {kw}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
