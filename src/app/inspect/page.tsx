"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { NewsGroup } from "@/types";
import type { SnapshotMeta, FeedGroupWithItems } from "@/lib/db";

type Tab = "feed" | "snapshot";

function formatRelative(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)    return `${diff}秒前`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}分前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}時間前`;
  return `${Math.floor(diff / 86400)}日前`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function SourceBadge({ count }: { count: number }) {
  const cls =
    count >= 3 ? "bg-green-100 text-green-700" :
    count === 2 ? "bg-yellow-100 text-yellow-700" :
    "bg-gray-100 text-gray-500";
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>
      {count}媒体
    </span>
  );
}

export default function InspectPage() {
  const [tab, setTab] = useState<Tab>("feed");

  const [feedGroups,  setFeedGroups]  = useState<FeedGroupWithItems[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError,   setFeedError]   = useState("");

  const [snapshot,       setSnapshot]       = useState<SnapshotMeta | null>(null);
  const [snapshotGroups, setSnapshotGroups] = useState<NewsGroup[]>([]);
  const [snapLoading,    setSnapLoading]    = useState(false);
  const [snapError,      setSnapError]      = useState("");

  const [expandedFeed, setExpandedFeed] = useState<Set<string>>(new Set());
  const [expandedSnap, setExpandedSnap] = useState<Set<string>>(new Set());

  useEffect(() => {
    setFeedLoading(true);
    setSnapLoading(true);

    fetch("/api/feed-groups")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setFeedGroups(d.groups ?? []);
      })
      .catch((e) => setFeedError(e.message))
      .finally(() => setFeedLoading(false));

    fetch("/api/batch/latest")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setSnapshot(d.snapshot ?? null);
        setSnapshotGroups(d.groups ?? []);
      })
      .catch((e) => setSnapError(e.message))
      .finally(() => setSnapLoading(false));
  }, []);

  function toggleFeed(id: string) {
    setExpandedFeed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSnap(id: string) {
    setExpandedSnap((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const multiOutletFeed  = feedGroups.filter((g) => !g.singleOutlet).length;
  const singleOutletFeed = feedGroups.filter((g) =>  g.singleOutlet).length;

  return (
    <div className="min-h-screen bg-gray-50/80">
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-gray-200/60">
        <div className="mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-lg font-black text-gray-900 tracking-tight hover:opacity-70 transition-opacity">
              NewsPrism
            </Link>
            <span className="text-[11px] text-gray-400 font-medium">点検</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/"        className="text-xs font-semibold text-gray-600 hover:text-gray-900 transition-colors">フィード</Link>
            <Link href="/ranking" className="text-xs font-semibold text-gray-600 hover:text-gray-900 transition-colors">まとめ</Link>
            <Link href="/compare" className="text-xs font-semibold text-purple-600 hover:text-purple-800 transition-colors">📊 メディア比較</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto px-4 sm:px-6 lg:px-8 py-6 max-w-[900px]">
        {/* タブ */}
        <div className="flex gap-6 border-b border-gray-200 mb-6">
          {(["feed", "snapshot"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`pb-3 text-sm font-semibold transition-colors ${
                tab === t
                  ? "border-b-2 border-blue-500 text-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t === "feed" ? "FeedGroups（DB）" : "Snapshot（バッチ結果）"}
            </button>
          ))}
        </div>

        {/* FeedGroups タブ */}
        {tab === "feed" && (
          <section>
            {feedLoading && (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
              </div>
            )}
            {feedError && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{feedError}</p>
            )}
            {!feedLoading && !feedError && (
              <>
                {/* サマリー */}
                <div className="flex gap-4 mb-4 text-xs text-gray-500">
                  <span>グループ総数: <strong className="text-gray-800">{feedGroups.length}</strong></span>
                  <span>多媒体: <strong className="text-green-700">{multiOutletFeed}</strong></span>
                  <span>単独報道: <strong className="text-gray-500">{singleOutletFeed}</strong></span>
                </div>

                {feedGroups.length === 0 ? (
                  <p className="text-sm text-gray-400">アクティブなFeedGroupがありません</p>
                ) : (
                  <div className="space-y-1">
                    {feedGroups.map((g) => {
                      const open = expandedFeed.has(g.id);
                      return (
                        <div key={g.id} className={`rounded-lg border bg-white ${g.singleOutlet ? "opacity-60" : ""}`}>
                          <button
                            onClick={() => toggleFeed(g.id)}
                            className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
                          >
                            <span className="text-sm font-medium text-gray-800 flex-1 truncate">{g.title}</span>
                            <span className="text-xs text-gray-400 shrink-0">{formatRelative(g.lastSeenAt)}</span>
                            <span className="text-xs bg-gray-100 text-gray-600 font-semibold px-2 py-0.5 rounded-full shrink-0">
                              {g.articleCount}件
                            </span>
                            <SourceBadge count={g.uniqueSourceCount} />
                            <span className="text-gray-400 text-xs shrink-0">{open ? "▼" : "▶"}</span>
                          </button>
                          <div className={`ranking-expand ${open ? "open" : ""}`}>
                            <div>
                              <ul className="border-t border-gray-100 divide-y divide-gray-50">
                                {g.items.map((item) => (
                                  <li key={item.id} className="flex items-start gap-2 px-3 py-2">
                                    <span className="text-xs font-semibold text-gray-500 shrink-0 w-24 truncate">{item.source}</span>
                                    <a
                                      href={item.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs text-gray-700 hover:text-blue-600 flex-1 line-clamp-2"
                                    >
                                      {item.title}
                                    </a>
                                    <span className="text-xs text-gray-400 shrink-0 whitespace-nowrap">
                                      {item.publishedAt ? formatRelative(item.publishedAt) : "—"}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {/* Snapshot タブ */}
        {tab === "snapshot" && (
          <section>
            {snapLoading && (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
              </div>
            )}
            {snapError && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{snapError}</p>
            )}
            {!snapLoading && !snapError && (
              <>
                {/* スナップショットメタ */}
                {snapshot ? (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mb-4 text-xs text-gray-500">
                    <span>処理日時: <strong className="text-gray-800">{formatDateTime(snapshot.processedAt)}</strong></span>
                    <span>グループ数: <strong className="text-gray-800">{snapshot.groupCount}</strong></span>
                    <span>記事数: <strong className="text-gray-800">{snapshot.articleCount}</strong></span>
                    <span>処理時間: <strong className="text-gray-800">{snapshot.durationMs}ms</strong></span>
                    <span>
                      ステータス:{" "}
                      <strong className={snapshot.status === "success" ? "text-green-700" : "text-yellow-700"}>
                        {snapshot.status}
                      </strong>
                    </span>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 mb-4">スナップショットなし</p>
                )}

                {snapshotGroups.length === 0 ? (
                  <p className="text-sm text-gray-400">グループがありません</p>
                ) : (
                  <div className="space-y-1">
                    {snapshotGroups.map((g, i) => {
                      const key = `${g.rank ?? i}-${g.groupTitle}`;
                      const open = expandedSnap.has(key);
                      const covered  = g.coveredBy   ?? [];
                      const silent   = g.silentMedia  ?? [];
                      return (
                        <div key={key} className={`rounded-lg border bg-white ${g.singleOutlet ? "opacity-60" : ""}`}>
                          <button
                            onClick={() => toggleSnap(key)}
                            className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
                          >
                            {g.rank != null && (
                              <span className="text-xs font-black text-gray-400 shrink-0 w-6 text-right">
                                {g.rank}
                              </span>
                            )}
                            <span className="text-sm font-medium text-gray-800 flex-1 truncate">{g.groupTitle}</span>
                            {g.category && (
                              <span className="text-xs bg-blue-50 text-blue-600 font-semibold px-2 py-0.5 rounded-full shrink-0">
                                {g.category}
                              </span>
                            )}
                            {covered.length > 0 && (
                              <span className="text-xs bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full shrink-0">
                                報道{covered.length}
                              </span>
                            )}
                            {silent.length > 0 && (
                              <span className="text-xs bg-gray-100 text-gray-500 font-semibold px-2 py-0.5 rounded-full shrink-0">
                                沈黙{silent.length}
                              </span>
                            )}
                            <span className="text-gray-400 text-xs shrink-0">{open ? "▼" : "▶"}</span>
                          </button>
                          <div className={`ranking-expand ${open ? "open" : ""}`}>
                            <div>
                              <div className="border-t border-gray-100 px-3 py-2 space-y-2">
                                {/* 媒体リスト */}
                                {(covered.length > 0 || silent.length > 0) && (
                                  <div className="flex flex-wrap gap-2 text-xs">
                                    {covered.map((m) => (
                                      <span key={m} className="bg-green-50 text-green-700 px-2 py-0.5 rounded">{m}</span>
                                    ))}
                                    {silent.map((m) => (
                                      <span key={m} className="bg-gray-50 text-gray-400 px-2 py-0.5 rounded line-through">{m}</span>
                                    ))}
                                  </div>
                                )}
                                {/* 記事リスト */}
                                <ul className="divide-y divide-gray-50">
                                  {g.items.map((item, j) => (
                                    <li key={j} className="flex items-start gap-2 py-1.5">
                                      <span className="text-xs font-semibold text-gray-500 shrink-0 w-24 truncate">{item.source}</span>
                                      <a
                                        href={item.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs text-gray-700 hover:text-blue-600 flex-1 line-clamp-2"
                                      >
                                        {item.title}
                                      </a>
                                      <span className="text-xs text-gray-400 shrink-0 whitespace-nowrap">
                                        {item.publishedAt ? formatRelative(item.publishedAt) : "—"}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
