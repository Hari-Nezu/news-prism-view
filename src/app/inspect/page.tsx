"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { NewsGroup, SnapshotMeta, FeedGroupWithItems, GroupInspectDetail } from "@/types";
import { API_BASE } from "@/lib/api-url";
import { formatRelative, formatDateTime } from "@/lib/format-time";

type Tab = "feed" | "snapshot";

interface RecomputeArticle {
  url:                    string;
  title:                  string;
  source:                 string;
  category:               string | null;
  hasEmbedding:           boolean;
  isUnknownCategory:      boolean;
  similarityToCentroid:   number | null;
  similarityBeforePenalty: number | null;
  similarityAfterPenalty:  number | null;
  wouldJoinAtThreshold:   boolean | null;
  nearestNeighbors: Array<{ url: string; title: string; source: string; groupId: string; groupTitle: string; similarity: number }>;
  alternativeClusters: Array<{ groupId: string; groupTitle: string; category: string | null; similarity: number }>;
}

interface RecomputeResult {
  snapshotId:          string;
  groupId:             string;
  groupTitle:          string;
  groupCategory:       string | null;
  hasCentroid:         boolean;
  articles:            RecomputeArticle[];
  thresholdSimulation: { threshold: number; wouldStay: number; wouldLeave: number; noEmbedding: number };
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

const SEVERITY_CLS: Record<string, string> = {
  high:   "bg-red-50 text-red-700 border-red-200",
  medium: "bg-yellow-50 text-yellow-700 border-yellow-200",
  low:    "bg-gray-50 text-gray-500 border-gray-200",
};

function IssueBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 shrink-0">
      警告{count}
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

  // groupId → inspect detail（lazy fetch）
  const [inspectCache, setInspectCache] = useState<Map<string, GroupInspectDetail | null>>(new Map());

  // groupId → recompute result
  const [recomputeCache,   setRecomputeCache]   = useState<Map<string, RecomputeResult | null>>(new Map());
  const [recomputeLoading, setRecomputeLoading] = useState<Set<string>>(new Set());
  // groupId → 開いている記事インデックス（nearest neighbors 展開用）
  const [expandedArticle, setExpandedArticle] = useState<Map<string, number | null>>(new Map());

  useEffect(() => {
    setFeedLoading(true);
    setSnapLoading(true);

    fetch(`${API_BASE}/api/feed-groups`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setFeedGroups(d.groups ?? []);
      })
      .catch((e) => setFeedError(e.message))
      .finally(() => setFeedLoading(false));

    fetch(`${API_BASE}/api/batch/latest`)
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

  function toggleSnap(groupId: string, snapshotId: string) {
    setExpandedSnap((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
        // キャッシュ済みでなければ fetch
        if (!inspectCache.has(groupId)) {
          fetch(`${API_BASE}/api/batch/inspect?snapshotId=${snapshotId}&groupId=${groupId}`)
            .then((r) => r.json())
            .then((d: GroupInspectDetail) => {
              setInspectCache((c) => new Map(c).set(groupId, d));
            })
            .catch(() => {
              setInspectCache((c) => new Map(c).set(groupId, null));
            });
        }
      }
      return next;
    });
  }

  function triggerRecompute(snapshotId: string, groupId: string) {
    setRecomputeLoading((prev) => new Set(prev).add(groupId));
    fetch(`${API_BASE}/api/batch/inspect/recompute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapshotId, groupId }),
    })
      .then((r) => r.json())
      .then((d: RecomputeResult) => {
        setRecomputeCache((c) => new Map(c).set(groupId, d));
      })
      .catch(() => {
        setRecomputeCache((c) => new Map(c).set(groupId, null));
      })
      .finally(() => {
        setRecomputeLoading((prev) => {
          const next = new Set(prev);
          next.delete(groupId);
          return next;
        });
      });
  }

  function toggleArticleDetail(groupId: string, idx: number) {
    setExpandedArticle((prev) => {
      const next = new Map(prev);
      next.set(groupId, prev.get(groupId) === idx ? null : idx);
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
                      const groupId   = g.id ?? `${g.rank ?? i}-${g.groupTitle}`;
                      const open      = expandedSnap.has(groupId);
                      const detail    = inspectCache.get(groupId) ?? null;
                      const recompute = recomputeCache.get(groupId) ?? null;
                      const rcLoading = recomputeLoading.has(groupId);
                      const covered = g.coveredBy  ?? [];
                      const silent  = g.silentMedia ?? [];
                      const issueCount = detail?.summary.issues.length ?? 0;
                      return (
                        <div key={groupId} className={`rounded-lg border bg-white ${g.singleOutlet ? "opacity-60" : ""}`}>
                          <button
                            onClick={() => snapshot && g.id
                              ? toggleSnap(g.id, snapshot.id)
                              : undefined
                            }
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
                            <IssueBadge count={issueCount} />
                            <span className="text-gray-400 text-xs shrink-0">{open ? "▼" : "▶"}</span>
                          </button>

                          <div className={`ranking-expand ${open ? "open" : ""}`}>
                            <div className="border-t border-gray-100">
                              {/* ローディング */}
                              {open && !detail && inspectCache.has(groupId) === false && (
                                <div className="flex items-center gap-2 px-3 py-2 text-xs text-gray-400">
                                  <div className="w-3 h-3 border border-gray-300 border-t-blue-400 rounded-full animate-spin" />
                                  読み込み中…
                                </div>
                              )}
                              {open && !inspectCache.has(groupId) && (
                                <div className="flex items-center gap-2 px-3 py-2 text-xs text-gray-400">
                                  <div className="w-3 h-3 border border-gray-300 border-t-blue-400 rounded-full animate-spin" />
                                  読み込み中…
                                </div>
                              )}

                              {/* Issues */}
                              {detail && detail.summary.issues.length > 0 && (
                                <div className="px-3 pt-2 space-y-1">
                                  {detail.summary.issues.map((issue, k) => (
                                    <div
                                      key={k}
                                      className={`text-xs px-2 py-1 rounded border ${SEVERITY_CLS[issue.severity] ?? SEVERITY_CLS.low}`}
                                    >
                                      {issue.message}
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* カテゴリ内訳（混在時のみ） */}
                              {detail && Object.keys(detail.summary.byCategory).length >= 2 && (
                                <div className="px-3 pt-2 flex flex-wrap gap-1">
                                  {Object.entries(detail.summary.byCategory).map(([cat, cnt]) => (
                                    <span key={cat} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                                      {cat} {cnt}件
                                    </span>
                                  ))}
                                </div>
                              )}

                              {/* 媒体リスト */}
                              {(covered.length > 0 || silent.length > 0) && (
                                <div className="flex flex-wrap gap-2 px-3 pt-2 text-xs">
                                  {covered.map((m) => (
                                    <span key={m} className="bg-green-50 text-green-700 px-2 py-0.5 rounded">{m}</span>
                                  ))}
                                  {silent.map((m) => (
                                    <span key={m} className="bg-gray-50 text-gray-400 px-2 py-0.5 rounded line-through">{m}</span>
                                  ))}
                                </div>
                              )}

                              {/* 記事リスト（inspect detail があれば category も表示） */}
                              <ul className="px-3 pt-2 pb-2 divide-y divide-gray-50">
                                {(detail?.articles ?? g.items ?? []).map((item, j) => {
                                  const cat = "category" in item ? item.category : null;
                                  const rcArticle = recompute?.articles.find((a) => a.url === item.url);
                                  const artExpanded = expandedArticle.get(groupId) === j;
                                  return (
                                    <li key={j} className="py-1.5">
                                      <div className="flex items-start gap-2">
                                        <span className="text-xs font-semibold text-gray-500 shrink-0 w-24 truncate">{item.source}</span>
                                        <a
                                          href={item.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-xs text-gray-700 hover:text-blue-600 flex-1 line-clamp-2"
                                        >
                                          {item.title}
                                        </a>
                                        {cat && (
                                          <span className="text-[10px] bg-blue-50 text-blue-500 px-1.5 py-0.5 rounded shrink-0">
                                            {cat}
                                          </span>
                                        )}
                                        {rcArticle && (
                                          <span
                                            className={`text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0 cursor-pointer ${
                                              rcArticle.wouldJoinAtThreshold === false
                                                ? "bg-red-50 text-red-600"
                                                : "bg-green-50 text-green-700"
                                            }`}
                                            title="similarityAfterPenalty — クリックで詳細"
                                            onClick={() => toggleArticleDetail(groupId, j)}
                                          >
                                            {rcArticle.similarityAfterPenalty !== null
                                              ? rcArticle.similarityAfterPenalty.toFixed(3)
                                              : "—"}
                                          </span>
                                        )}
                                        <span className="text-xs text-gray-400 shrink-0 whitespace-nowrap">
                                          {item.publishedAt ? formatRelative(item.publishedAt) : "—"}
                                        </span>
                                      </div>
                                      {/* 記事詳細（nearest neighbors / alternative clusters） */}
                                      {rcArticle && artExpanded && (
                                        <div className="mt-1.5 ml-26 pl-2 border-l-2 border-gray-100 space-y-2 text-[11px]">
                                          <div className="flex gap-3 text-gray-500">
                                            <span>centroid類似度: <span className="font-mono text-gray-700">{rcArticle.similarityToCentroid?.toFixed(4) ?? "—"}</span></span>
                                            {rcArticle.isUnknownCategory && (
                                              <span className="text-yellow-600">カテゴリ不明 (-0.05)</span>
                                            )}
                                          </div>
                                          {rcArticle.nearestNeighbors.length > 0 && (
                                            <div>
                                              <p className="text-gray-400 font-semibold mb-0.5">近傍記事</p>
                                              <ul className="space-y-0.5">
                                                {rcArticle.nearestNeighbors.map((n, ni) => (
                                                  <li key={ni} className="flex gap-2 items-start">
                                                    <span className="font-mono text-gray-500 shrink-0">{n.similarity.toFixed(3)}</span>
                                                    <span className="text-gray-400 shrink-0 truncate max-w-[80px]">{n.source}</span>
                                                    <span className="text-gray-600 line-clamp-1 flex-1">{n.title}</span>
                                                    {n.groupId !== groupId && (
                                                      <span className="text-[10px] bg-orange-50 text-orange-600 px-1 rounded shrink-0">別グループ</span>
                                                    )}
                                                  </li>
                                                ))}
                                              </ul>
                                            </div>
                                          )}
                                          {rcArticle.alternativeClusters.length > 0 && (
                                            <div>
                                              <p className="text-gray-400 font-semibold mb-0.5">代替クラスタ候補</p>
                                              <ul className="space-y-0.5">
                                                {rcArticle.alternativeClusters.map((ac, ai) => (
                                                  <li key={ai} className="flex gap-2 items-center">
                                                    <span className="font-mono text-gray-500 shrink-0">{ac.similarity.toFixed(3)}</span>
                                                    <span className="text-gray-600 line-clamp-1">{ac.groupTitle}</span>
                                                    {ac.category && (
                                                      <span className="text-[10px] bg-blue-50 text-blue-500 px-1 rounded shrink-0">{ac.category}</span>
                                                    )}
                                                  </li>
                                                ))}
                                              </ul>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </li>
                                  );
                                })}
                              </ul>

                              {/* 再計算診断ボタン・結果 */}
                              {detail && snapshot && g.id && (
                                <div className="px-3 pb-3 border-t border-gray-50 pt-2">
                                  {!recompute && !rcLoading && (
                                    <button
                                      onClick={() => triggerRecompute(snapshot.id, g.id!)}
                                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded transition-colors"
                                    >
                                      再計算診断を実行
                                    </button>
                                  )}
                                  {rcLoading && (
                                    <div className="flex items-center gap-2 text-xs text-gray-400">
                                      <div className="w-3 h-3 border border-gray-300 border-t-indigo-400 rounded-full animate-spin" />
                                      再計算中…
                                    </div>
                                  )}
                                  {recompute && (
                                    <div className="space-y-2">
                                      <div className="flex items-center gap-3 text-xs">
                                        <span className="font-semibold text-gray-500">閾値シミュレーション (thr={recompute.thresholdSimulation.threshold})</span>
                                        <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded font-semibold">残留 {recompute.thresholdSimulation.wouldStay}</span>
                                        <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded font-semibold">離脱 {recompute.thresholdSimulation.wouldLeave}</span>
                                        {recompute.thresholdSimulation.noEmbedding > 0 && (
                                          <span className="bg-gray-100 text-gray-400 px-2 py-0.5 rounded font-semibold">embedding無 {recompute.thresholdSimulation.noEmbedding}</span>
                                        )}
                                        <button
                                          onClick={() => triggerRecompute(snapshot.id, g.id!)}
                                          className="text-xs text-gray-400 hover:text-gray-600 ml-auto"
                                        >
                                          再実行
                                        </button>
                                      </div>
                                      <p className="text-[11px] text-gray-400">各記事の類似度スコアをクリックで近傍・代替クラスタを表示</p>
                                    </div>
                                  )}
                                </div>
                              )}
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
