"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import type { NewsGroup, AnalyzedArticle } from "@/types";
import { getSourceColors } from "@/lib/source-colors";
import { groupItemsBySource } from "@/lib/group-items-by-source";
import MediaComparisonView from "@/components/MediaComparisonView";

const MEDIA = [
  { short: "N",    label: "NHK",               match: (s: string) => s.startsWith("NHK") },
  { short: "朝",   label: "朝日新聞",           match: (s: string) => s.startsWith("朝日") },
  { short: "毎",   label: "毎日新聞",           match: (s: string) => s.startsWith("毎日") },
  { short: "読",   label: "読売新聞",           match: (s: string) => s.startsWith("読売") },
  { short: "経",   label: "日本経済新聞",       match: (s: string) => s.startsWith("日経") || s === "日本経済新聞" },
  { short: "産",   label: "産経新聞",           match: (s: string) => s.startsWith("産経") },
  { short: "東",   label: "東京新聞",           match: (s: string) => s === "東京新聞" },
  { short: "時",   label: "時事通信",           match: (s: string) => s === "時事通信" },
  { short: "共",   label: "共同通信",           match: (s: string) => s === "共同通信" },
  { short: "T",    label: "TBSニュース",        match: (s: string) => s.startsWith("TBS") },
  { short: "テレ", label: "テレビ朝日",         match: (s: string) => s === "テレビ朝日" },
  { short: "フジ", label: "フジテレビ",         match: (s: string) => s === "フジテレビ" },
  { short: "NTV",  label: "日本テレビ",         match: (s: string) => s === "日本テレビ" },
  { short: "洋",   label: "東洋経済オンライン", match: (s: string) => s.includes("東洋経済") },
  { short: "ハ",   label: "ハフポスト日本版",   match: (s: string) => s.startsWith("ハフ") },
];

type OverlayView =
  | { type: "articles" }
  | { type: "analyzing"; progress: number; total: number }
  | { type: "results"; results: AnalyzedArticle[] }
  | { type: "error"; message: string };

function sortGroups(groups: NewsGroup[]): NewsGroup[] {
  return [...groups].sort((a, b) => {
    if (a.singleOutlet !== b.singleOutlet) return a.singleOutlet ? 1 : -1;
    const sa = new Set(a.items.map((i) => i.source)).size;
    const sb = new Set(b.items.map((i) => i.source)).size;
    if (sb !== sa) return sb - sa;
    return b.items.length - a.items.length;
  });
}

function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "今";
  if (mins < 60) return `${mins}分前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}時間前`;
  return `${Math.floor(hours / 24)}日前`;
}

interface Props {
  groups: NewsGroup[];
}

export default function CoverageMatrix({ groups }: Props) {
  const [selected, setSelected] = useState<NewsGroup | null>(null);
  const [overlayView, setOverlayView] = useState<OverlayView>({ type: "articles" });
  const [mounted, setMounted] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { setMounted(true); }, []);

  // selected が変わったら view をリセット・進行中の分析を中断
  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setOverlayView({ type: "articles" });
  }, [selected]);

  const closeOverlay = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setSelected(null);
  }, []);

  const startComparison = useCallback(async (group: NewsGroup) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const validItems = group.items
      .filter((i) => { try { new URL(i.url); return true; } catch { return false; } })
      .slice(0, 10);

    if (validItems.length === 0) {
      setOverlayView({ type: "error", message: "有効なURLを持つ記事がありません" });
      return;
    }

    setOverlayView({ type: "analyzing", progress: 0, total: validItems.length });

    const collected: AnalyzedArticle[] = [];

    try {
      const res = await fetch("/api/compare/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: validItems.map((i) => ({
            title: i.title,
            url: i.url,
            source: i.source,
            publishedAt: i.publishedAt,
          })),
        }),
        signal: ac.signal,
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
              collected.push(payload.article as AnalyzedArticle);
              setOverlayView({ type: "analyzing", progress: collected.length, total: validItems.length });
            } else if ("total" in payload && !("index" in payload)) {
              setOverlayView({ type: "results", results: [...collected] });
            }
          } catch {
            // ignore parse errors
          }
        }
      }

      if (collected.length > 0 && overlayView.type !== "results") {
        setOverlayView({ type: "results", results: [...collected] });
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setOverlayView({
        type: "error",
        message: err instanceof Error ? err.message : "分析中にエラーが発生しました",
      });
    }
  }, [overlayView.type]);

  const sorted = sortGroups(groups);
  const multiOutlet = sorted.filter((g) => !g.singleOutlet);

  if (multiOutlet.length === 0) return null;

  const activeMedia = MEDIA.filter((m) =>
    multiOutlet.some((g) => g.items.some((item) => m.match(item.source)))
  );

  if (activeMedia.length === 0) return null;

  function countArticles(group: NewsGroup, media: (typeof MEDIA)[0]): number {
    return group.items.filter((item) => media.match(item.source)).length;
  }

  return (
    <>
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden mb-5">
        <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
          <span className="text-sm font-bold text-gray-700">報道カバレッジマトリクス</span>
          <span className="text-xs text-gray-400 ml-1">行クリックで記事一覧</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="sticky left-0 z-10 bg-gray-50/60 px-3 py-2 text-left text-xs font-medium text-gray-500 w-[220px] min-w-[220px]">
                  トピック
                </th>
                {activeMedia.map((m) => (
                  <th
                    key={m.short}
                    title={m.label}
                    className="px-2 py-2 text-center text-xs font-bold text-gray-500 min-w-[36px]"
                  >
                    {m.short}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {multiOutlet.map((group, idx) => {
                const rank = sorted.indexOf(group) + 1;
                return (
                  <tr
                    key={group.id ?? `${idx}-${group.groupTitle}`}
                    className="border-b border-gray-50 last:border-0 hover:bg-amber-50/50 cursor-pointer transition-colors group"
                    onClick={() => setSelected(group)}
                  >
                    <td className="sticky left-0 z-10 bg-white group-hover:bg-amber-50/50 px-3 py-2 transition-colors w-[220px] min-w-[220px] max-w-[220px]">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-bold text-amber-500 tabular-nums flex-shrink-0">
                          {rank}
                        </span>
                        <span className="text-xs text-gray-700 truncate">{group.groupTitle}</span>
                      </div>
                    </td>
                    {activeMedia.map((m) => {
                      const count = countArticles(group, m);
                      return (
                        <td key={m.short} className="px-2 py-2 text-center">
                          {count === 0 ? (
                            <span className="text-xs text-gray-200 leading-none">○</span>
                          ) : count === 1 ? (
                            <span className="text-sm text-sky-300 leading-none" title="1件">●</span>
                          ) : (
                            <span className="text-sm text-sky-600 leading-none font-bold" title={`${count}件`}>●</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* オーバーレイ: document.body に portal で描画してスタッキングコンテキストを回避 */}
      {mounted && selected && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={closeOverlay}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ヘッダ */}
            <div className="flex items-start gap-3 px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900 leading-snug">{selected.groupTitle}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {new Set(selected.items.map((i) => i.source)).size}媒体 / {selected.items.length}件
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {overlayView.type === "results" && (
                  <button
                    onClick={() => setOverlayView({ type: "articles" })}
                    className="text-xs text-gray-500 hover:text-gray-800 transition-colors px-2 py-1 rounded-lg hover:bg-gray-100"
                  >
                    ← 記事一覧
                  </button>
                )}
                {overlayView.type === "articles" && (
                  <button
                    onClick={() => startComparison(selected)}
                    className="text-xs font-semibold text-white bg-indigo-500 hover:bg-indigo-600 transition-colors px-3 py-1.5 rounded-lg"
                  >
                    報道姿勢を比較
                  </button>
                )}
                {overlayView.type === "error" && (
                  <button
                    onClick={() => startComparison(selected)}
                    className="text-xs font-semibold text-white bg-indigo-500 hover:bg-indigo-600 transition-colors px-3 py-1.5 rounded-lg"
                  >
                    再試行
                  </button>
                )}
                <button
                  onClick={closeOverlay}
                  className="text-gray-400 hover:text-gray-700 transition-colors text-lg leading-none mt-0.5"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* ボディ */}
            <div className="overflow-y-auto flex-1">
              {overlayView.type === "articles" && (
                <div className="p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {Array.from(groupItemsBySource(selected.items)).map(([source, items]) => {
                      const colors = getSourceColors(source);
                      return (
                        <div
                          key={source}
                          className="border border-gray-100 rounded-lg overflow-hidden"
                          style={{ borderLeftColor: colors.dotColor, borderLeftWidth: "3px" }}
                        >
                          <div className="flex items-center gap-1.5 px-3 py-2 bg-gray-50/60">
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: colors.dotColor }} />
                            <span className="text-[11px] font-bold truncate" style={{ color: colors.textColor }}>{source}</span>
                            <span className="text-[10px] text-gray-400 ml-auto flex-shrink-0">{items.length}件</span>
                          </div>
                          <div className="divide-y divide-gray-50">
                            {items.map((item, i) => (
                              <div key={i} className="px-3 py-2 hover:bg-blue-50/60 transition-colors">
                                {item.publishedAt && (
                                  <div className="text-[10px] text-gray-400 mb-0.5">{formatRelative(item.publishedAt)}</div>
                                )}
                                <div className="flex items-start gap-2">
                                  <p className="flex-1 text-xs text-gray-800 line-clamp-2 leading-snug">{item.title}</p>
                                  {item.url && (
                                    <a
                                      href={item.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-[10px] text-gray-400 hover:text-gray-600 flex-shrink-0 mt-0.5"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      ↗
                                    </a>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {overlayView.type === "analyzing" && (
                <div className="flex flex-col items-center justify-center h-48 gap-4">
                  <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                  <div className="text-center">
                    <p className="text-sm font-semibold text-gray-700">報道姿勢を分析中...</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {overlayView.progress} / {overlayView.total} 件
                    </p>
                  </div>
                  <div className="w-48 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-1.5 bg-indigo-500 rounded-full transition-all"
                      style={{ width: `${(overlayView.progress / overlayView.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {overlayView.type === "results" && (
                <div className="p-4">
                  <MediaComparisonView group={selected} results={overlayView.results} />
                </div>
              )}

              {overlayView.type === "error" && (
                <div className="flex flex-col items-center justify-center h-48 gap-3">
                  <p className="text-sm text-red-500 font-semibold">分析に失敗しました</p>
                  <p className="text-xs text-gray-400">{overlayView.message}</p>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
