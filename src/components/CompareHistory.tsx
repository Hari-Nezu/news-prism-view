"use client";

import { useState, useEffect, useCallback } from "react";
import { API_BASE } from "@/lib/api-url";
import type { NewsGroup } from "@/types";

interface SessionRow {
  id: string;
  keyword: string;
  savedAt: string;
  groups: NewsGroup[];
  results: { source: string }[];
}

interface Props {
  onRestore: (keyword: string, groups: NewsGroup[]) => void;
}

export default function CompareHistory({ onRestore }: Props) {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/history?type=compare`);
      const data = await res.json();
      if (res.ok) setSessions(data.sessions ?? []);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen, load]);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-bold text-gray-700 hover:bg-gray-50/50 transition-colors"
      >
        <span>🗂 検索履歴</span>
        <span className={`text-gray-400 text-[10px] transition-transform ${isOpen ? "rotate-180" : ""}`}>
          ▼
        </span>
      </button>

      {isOpen && (
        <div>
          <div className="flex justify-end px-5 py-1.5 border-t border-gray-100">
            <button onClick={load} disabled={isLoading}
              className="text-xs text-purple-600 hover:text-purple-800 font-medium disabled:opacity-50 transition-colors">
              {isLoading ? "読込中..." : "更新"}
            </button>
          </div>

          <ul className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
            {sessions.length === 0 && !isLoading && (
              <li className="px-5 py-8 text-center text-xs text-gray-400">
                検索履歴がありません
              </li>
            )}
            {sessions.map((s) => {
              const groups: NewsGroup[] = Array.isArray(s.groups) ? s.groups : [];
              const multiOutlet = groups.filter((g) => !g.singleOutlet).length;
              const sources = [...new Set(s.results.map((r) => r.source))];

              return (
                <li
                  key={s.id}
                  className="px-5 py-3.5 hover:bg-purple-50/50 transition-colors cursor-pointer"
                  onClick={() => onRestore(s.keyword, groups)}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="text-sm font-semibold text-gray-800">
                      {s.keyword}
                    </p>
                    <span className="text-[10px] text-gray-400 flex-shrink-0">
                      {new Date(s.savedAt).toLocaleDateString("ja-JP")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap text-[10px]">
                    <span className="text-gray-500">
                      {groups.length}グループ
                    </span>
                    {multiOutlet > 0 && (
                      <span className="text-purple-600 font-semibold">
                        複数媒体: {multiOutlet}件
                      </span>
                    )}
                    {sources.length > 0 && (
                      <span className="text-gray-400 ml-auto">
                        {sources.join(" · ")}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
