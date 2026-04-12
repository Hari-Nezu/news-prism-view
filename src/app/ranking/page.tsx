"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { NewsGroup, SnapshotMeta } from "@/types";
import { API_BASE } from "@/lib/api-url";
import CoverageMatrix from "@/components/CoverageMatrix";
import OllamaStatus from "@/components/OllamaStatus";

function formatRelative(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)  return `${diff}秒前`;
  if (diff < 3600) return `${Math.floor(diff / 60)}分前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}時間前`;
  return `${Math.floor(diff / 86400)}日前`;
}

export default function RankingPage() {
  const [snapshot,   setSnapshot]   = useState<SnapshotMeta | null>(null);
  const [groups,     setGroups]     = useState<NewsGroup[]>([]);
  const [isLoading,  setIsLoading]  = useState(false);
  const [isRunning,  setIsRunning]  = useState(false);
  const [error,      setError]      = useState("");
  const [runMessage, setRunMessage] = useState("");

  const fetchLatest = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/batch/latest`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "取得に失敗しました");
      setSnapshot(data.snapshot ?? null);
      setGroups(data.groups ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "取得に失敗しました");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchLatest(); }, [fetchLatest]);

  async function handleRun() {
    setIsRunning(true);
    setRunMessage("");
    try {
      const res = await fetch(`${API_BASE}/api/batch/run`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setRunMessage(`エラー: ${data.error}`);
      } else {
        setRunMessage("バッチを開始しました。完了後に「更新」で再読み込みしてください。");
      }
    } catch {
      setRunMessage("バッチサーバーに接続できませんでした");
    } finally {
      setIsRunning(false);
    }
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

      <main className="mx-auto px-4 sm:px-6 lg:px-8 py-6 max-w-[1200px]">
        {/* ツールバー */}
        <div className="flex items-center gap-2 mb-4">
          {snapshot ? (
            <span className="text-xs text-gray-500">
              最終更新: <span className="text-gray-700 font-medium">{formatRelative(snapshot.processedAt)}</span>
              <span className="ml-2 text-gray-400">
                ({snapshot.groupCount}グループ / {snapshot.articleCount}記事)
              </span>
            </span>
          ) : (
            <span className="text-xs text-gray-400">スナップショットなし</span>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={handleRun}
              disabled={isRunning || isLoading}
              title="Goバッチを手動実行"
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-50 disabled:opacity-50 transition-colors"
            >
              {isRunning
                ? <div className="w-3.5 h-3.5 border-2 border-amber-300 border-t-amber-600 rounded-full animate-spin" />
                : <span>⚡</span>
              }
              バッチ実行
            </button>
            <button
              onClick={fetchLatest}
              disabled={isLoading || isRunning}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {isLoading
                ? <div className="w-3.5 h-3.5 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
                : <span>↻</span>
              }
              更新
            </button>
          </div>
        </div>

        {runMessage && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-2 mb-4">
            <p className="text-xs text-amber-700">{runMessage}</p>
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 mb-4">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <div className="w-8 h-8 border-2 border-gray-200 border-t-amber-500 rounded-full animate-spin mb-4" />
            <p className="text-sm">読み込み中...</p>
          </div>
        ) : !snapshot ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <p className="text-sm mb-2">スナップショットがありません</p>
            <p className="text-xs">「バッチ実行」ボタンで最初のスナップショットを生成してください。</p>
          </div>
        ) : (
          <CoverageMatrix groups={groups} />
        )}
      </main>
    </div>
  );
}
