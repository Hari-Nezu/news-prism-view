"use client";

import { useState } from "react";
import type { Article } from "@/types";

interface Props {
  onAnalyze: (article: Article) => void;
  isLoading: boolean;
}

type InputMode = "text" | "url";

export default function ArticleInput({ onAnalyze, isLoading }: Props) {
  const [mode, setMode] = useState<InputMode>("text");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [fetchError, setFetchError] = useState("");
  const [isFetching, setIsFetching] = useState(false);

  const handleFetchUrl = async () => {
    if (!url) return;
    setIsFetching(true);
    setFetchError("");
    try {
      const res = await fetch("/api/fetch-article", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTitle(data.article.title);
      setContent(data.article.content);
      setMode("text");
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "取得失敗");
    } finally {
      setIsFetching(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    onAnalyze({ title: title.trim(), content: content.trim(), url: url || undefined });
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-700 mb-4">記事を入力</h2>

      {/* モード切り替え */}
      <div className="flex gap-2 mb-4">
        {(["text", "url"] as InputMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              mode === m
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {m === "text" ? "テキスト入力" : "URLから取得"}
          </button>
        ))}
      </div>

      {mode === "url" && (
        <div className="mb-4">
          <div className="flex gap-2">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              className="flex-1 text-sm text-gray-900 border border-gray-300 rounded-lg px-3 py-2 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            <button
              onClick={handleFetchUrl}
              disabled={isFetching || !url}
              className="px-4 py-2 bg-gray-800 text-white text-xs rounded-lg disabled:opacity-50 hover:bg-gray-700 transition-colors"
            >
              {isFetching ? "取得中..." : "取得"}
            </button>
          </div>
          {fetchError && (
            <p className="text-xs text-red-500 mt-1">{fetchError}</p>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="記事タイトル"
          className="text-sm text-gray-900 border border-gray-300 rounded-lg px-3 py-2 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-300"
          required
        />
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="記事本文を貼り付けてください..."
          rows={6}
          className="text-sm text-gray-900 border border-gray-300 rounded-lg px-3 py-2 bg-white placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
          required
        />
        <button
          type="submit"
          disabled={isLoading || !title.trim() || !content.trim()}
          className="py-2 bg-blue-600 text-white text-sm font-medium rounded-lg disabled:opacity-50 hover:bg-blue-700 transition-colors"
        >
          {isLoading ? "分析中..." : "3軸分析を実行"}
        </button>
      </form>
    </div>
  );
}
