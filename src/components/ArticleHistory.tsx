"use client";

import { useState, useEffect, useCallback } from "react";
import type { AnalyzedArticle } from "@/types";
import { getTopicDef } from "@/lib/topic-classifier";
import type { TopicId } from "@/lib/topic-classifier";

interface Props {
  onRestore: (article: AnalyzedArticle) => void;
}

export default function ArticleHistory({ onRestore }: Props) {
  const [articles, setArticles] = useState<AnalyzedArticle[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/history?type=articles");
      const data = await res.json();
      if (res.ok) setArticles(data.articles ?? []);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen, load]);

  const scoreLabel = (val: number) =>
    val > 0.3 ? "革新" : val < -0.3 ? "保守" : "中立";

  // カテゴリ別にグループ化
  const grouped = articles.reduce<Record<string, AnalyzedArticle[]>>((acc, a) => {
    const key = a.category ?? "other";
    (acc[key] ??= []).push(a);
    return acc;
  }, {});
  const topicKeys = Object.keys(grouped);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <span>🗂 分析履歴</span>
        <span className="text-gray-400 text-xs">{isOpen ? "▲" : "▼"}</span>
      </button>

      {isOpen && (
        <div>
          <div className="flex justify-end px-4 py-1 border-t border-gray-100">
            <button onClick={load} disabled={isLoading}
              className="text-xs text-blue-600 hover:underline disabled:opacity-50">
              {isLoading ? "読込中..." : "更新"}
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {articles.length === 0 && !isLoading && (
              <p className="px-4 py-6 text-center text-xs text-gray-400">
                分析履歴がありません
              </p>
            )}
            {topicKeys.map((topicKey) => {
              const def = getTopicDef(topicKey as TopicId);
              return (
                <div key={topicKey}>
                  <div className="px-4 py-1 bg-gray-50 border-t border-gray-100 flex items-center gap-1">
                    <span className="text-xs">{def.icon}</span>
                    <span className="text-[11px] font-semibold text-gray-500">{def.label}</span>
                  </div>
                  <ul className="divide-y divide-gray-50">
                    {grouped[topicKey].map((a, i) => (
                      <li key={i}
                        className="px-4 py-3 hover:bg-blue-50 transition-colors cursor-pointer"
                        onClick={() => onRestore(a)}
                      >
                        <p className="text-xs font-medium text-gray-800 line-clamp-1 mb-1">
                          {a.title}
                        </p>
                        <div className="flex items-center gap-2 flex-wrap">
                          {a.source && (
                            <span className="text-[10px] text-blue-600 font-medium">{a.source}</span>
                          )}
                          <span className="text-[10px] text-gray-400 font-mono">
                            経{scoreLabel(a.analysis.scores.economic)}
                            ／社{scoreLabel(a.analysis.scores.social)}
                            ／外{scoreLabel(a.analysis.scores.diplomatic)}
                          </span>
                          <span className="text-[10px] text-gray-400 ml-auto">
                            {new Date(a.analyzedAt).toLocaleDateString("ja-JP")}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
