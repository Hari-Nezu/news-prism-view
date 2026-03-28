"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import OllamaStatus from "@/components/OllamaStatus";
import RssFeedPanel from "@/components/RssFeedPanel";
import PositioningPlot from "@/components/PositioningPlot";
import ScoreCard from "@/components/ScoreCard";
import ArticleHistory from "@/components/ArticleHistory";
import type { Article, AnalyzedArticle, RssFeedItem } from "@/types";

/** URL または タイトルで既分析済みの記事インデックスを返す */
function findDuplicateIndex(
  articles: AnalyzedArticle[],
  article: Pick<Article, "url" | "title">
): number {
  if (article.url) {
    const idx = articles.findIndex((a) => a.url === article.url);
    if (idx !== -1) return idx;
  }
  return articles.findIndex((a) => a.title === article.title);
}

export default function Home() {
  const [articles, setArticles] = useState<AnalyzedArticle[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | undefined>();
  const [highlightedIndex, setHighlightedIndex] = useState<number | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [duplicateMsg, setDuplicateMsg] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [analyzingUrl, setAnalyzingUrl] = useState<string | undefined>();

  // URL入力用
  const [urlInput, setUrlInput] = useState("");
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);

  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  /** 重複時: ハイライトして該当カードへスクロール */
  const highlightExisting = useCallback((idx: number) => {
    setSelectedIndex(idx);
    setHighlightedIndex(idx);
    setDuplicateMsg("この記事はすでに分析済みです。過去の結果を表示しています。");
    setPanelOpen(true);

    setTimeout(() => {
      cardRefs.current[idx]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);

    setTimeout(() => {
      setHighlightedIndex(undefined);
      setDuplicateMsg("");
    }, 2000);
  }, []);

  const handleAnalyze = useCallback(async (article: Article) => {
    const dupIdx = findDuplicateIndex(articles, article);
    if (dupIdx !== -1) {
      highlightExisting(dupIdx);
      return;
    }

    setIsLoading(true);
    setError("");
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: article.title, content: article.content, url: article.url, source: article.source }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const analyzed: AnalyzedArticle = {
        ...article,
        analysis: data.analysis,
        analyzedAt: new Date().toISOString(),
      };
      setArticles((prev) => {
        const next = [analyzed, ...prev];
        setSelectedIndex(0);
        return next;
      });
      setPanelOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "分析に失敗しました");
    } finally {
      setIsLoading(false);
      setAnalyzingUrl(undefined);
    }
  }, [articles, highlightExisting]);

  const handleRssSelect = useCallback(async (item: RssFeedItem) => {
    if (!item.url) return;

    const dupIdx = findDuplicateIndex(articles, { url: item.url, title: item.title });
    if (dupIdx !== -1) {
      highlightExisting(dupIdx);
      return;
    }

    setIsLoading(true);
    setError("");
    setAnalyzingUrl(item.url);
    try {
      const res = await fetch("/api/fetch-article", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: item.url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await handleAnalyze({ ...data.article, source: item.source });
    } catch (e) {
      setError(e instanceof Error ? e.message : "記事の取得に失敗しました");
      setIsLoading(false);
      setAnalyzingUrl(undefined);
    }
  }, [articles, highlightExisting, handleAnalyze]);

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;
    setIsFetchingUrl(true);
    setError("");
    try {
      const res = await fetch("/api/fetch-article", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await handleAnalyze(data.article);
      setUrlInput("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "記事の取得に失敗しました");
    } finally {
      setIsFetchingUrl(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50/80">
      {/* ヘッダー */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-gray-200/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-black text-gray-900 tracking-tight">
              NewsPrism
            </h1>
            <span className="hidden sm:inline text-[11px] text-gray-400 font-medium">
              3軸ポジショニング・インテリジェンス
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <Link
              href="/compare"
              className="text-xs font-semibold text-purple-600 hover:text-purple-800 transition-colors whitespace-nowrap"
            >
              <span className="sm:hidden">📊</span>
              <span className="hidden sm:inline">📊 メディア比較</span>
            </Link>
            {articles.length > 0 && (
              <button
                onClick={() => setPanelOpen(!panelOpen)}
                className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                  panelOpen
                    ? "bg-blue-600 text-white"
                    : "bg-blue-50 text-blue-600 hover:bg-blue-100"
                }`}
              >
                <span>📈</span>
                <span className="hidden sm:inline">分析結果</span>
                <span className="bg-white/20 px-1.5 py-0.5 rounded text-[10px]">
                  {articles.length}
                </span>
              </button>
            )}
            <div className="hidden sm:flex">
              <OllamaStatus />
            </div>
          </div>
        </div>
      </header>

      {/* URL入力バー */}
      <div className="bg-white border-b border-gray-100">
        <form onSubmit={handleUrlSubmit} className="max-w-3xl mx-auto px-4 sm:px-6 py-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔗</span>
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="URLを貼り付けて記事を分析..."
                className="w-full text-sm text-gray-900 border border-gray-300 rounded-xl pl-9 pr-4 py-2.5 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={isFetchingUrl || !urlInput.trim()}
              className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl disabled:opacity-40 hover:bg-blue-700 transition-colors shadow-sm"
            >
              {isFetchingUrl ? "取得中..." : "分析"}
            </button>
          </div>
        </form>
      </div>

      {/* エラー / 重複メッセージ */}
      {(error || duplicateMsg) && (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 mt-4">
          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 mb-2">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
          {duplicateMsg && (
            <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 transition-opacity">
              <p className="text-sm text-blue-600">💡 {duplicateMsg}</p>
            </div>
          )}
        </div>
      )}

      {/* メインコンテンツ */}
      <div className="flex">
        {/* ニュースタイムライン（中央） */}
        <main className={`flex-1 min-w-0 transition-all duration-300 ${panelOpen ? "md:mr-[440px]" : ""}`}>
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
            <RssFeedPanel
              onAnalyze={handleRssSelect}
              onCompare={() => window.location.href = "/compare"}
              onCompareArticle={(item) => {
                window.location.href = `/compare?q=${encodeURIComponent(item.title)}`;
              }}
              analyzedUrls={articles.map((a) => a.url ?? "")}
              analyzingUrl={analyzingUrl}
            />
          </div>
        </main>

        {/* 分析結果パネル（右スライド） */}
        <aside
          className={`fixed right-0 top-0 h-full w-full md:w-[440px] bg-white border-l border-gray-200 shadow-2xl z-30 transform transition-transform duration-300 ease-out ${
            panelOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          {/* パネルヘッダー */}
          <div className="sticky top-0 bg-white/90 backdrop-blur-sm z-10 border-b border-gray-100 px-5 py-4 flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900">分析結果</h2>
            <button
              onClick={() => setPanelOpen(false)}
              className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center text-xs transition-colors"
            >
              ✕
            </button>
          </div>

          {/* パネル内容 */}
          <div className="overflow-y-auto h-[calc(100%-60px)] px-5 py-4 space-y-5">
            {/* ポジショニングプロット */}
            {articles.length > 0 && (
              <div className="flex flex-col items-center">
                <PositioningPlot
                  articles={articles}
                  selectedIndex={selectedIndex}
                  onSelect={setSelectedIndex}
                />
              </div>
            )}

            {/* 凡例 */}
            {articles.length > 0 && (
              <div className="flex flex-wrap gap-1.5 justify-center">
                {articles.map((a, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedIndex(i)}
                    className={`text-[10px] px-2 py-1 rounded-full border transition-colors ${
                      i === selectedIndex
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"
                    }`}
                  >
                    {i + 1}. {a.title.slice(0, 15)}...
                  </button>
                ))}
              </div>
            )}

            {/* 分析履歴 */}
            <ArticleHistory onRestore={(a) => {
              const dup = findDuplicateIndex(articles, a);
              if (dup !== -1) { highlightExisting(dup); return; }
              setArticles((prev) => [a, ...prev]);
              setSelectedIndex(0);
            }} />

            {/* スコアカード */}
            {articles.map((article, i) => (
              <div
                key={`${article.url ?? article.title}-${i}`}
                ref={(el) => { cardRefs.current[i] = el; }}
                className={`transition-opacity ${
                  selectedIndex !== undefined && i !== selectedIndex
                    ? "opacity-40"
                    : "opacity-100"
                }`}
              >
                <ScoreCard
                  article={article}
                  index={i}
                  highlighted={i === highlightedIndex}
                />
              </div>
            ))}

            {articles.length === 0 && (
              <div className="text-center py-12">
                <p className="text-3xl mb-3">📊</p>
                <p className="text-sm text-gray-400">
                  記事を分析するとここに結果が表示されます
                </p>
                <p className="text-xs text-gray-300 mt-1">
                  ニュースフィードから記事を選択してください
                </p>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* 分析中オーバーレイ */}
      {isLoading && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className="flex items-center gap-3 bg-gray-900 text-white px-5 py-3 rounded-2xl shadow-2xl">
            <div className="w-4 h-4 border-2 border-gray-600 border-t-white rounded-full animate-spin" />
            <span className="text-sm font-medium">記事を分析しています...</span>
          </div>
        </div>
      )}
    </div>
  );
}
