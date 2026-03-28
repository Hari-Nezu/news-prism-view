import type { AnalyzedArticle } from "@/types";

interface Props {
  article: AnalyzedArticle;
  index: number;
  highlighted?: boolean;
}

function ScoreBar({ value, label }: { value: number; label: string }) {
  const pct = ((value + 1) / 2) * 100;
  return (
    <div className="mb-2">
      <div className="flex justify-between text-xs text-gray-500 mb-0.5">
        <span>{label}</span>
        <span className="font-mono">{value.toFixed(2)}</span>
      </div>
      <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="absolute top-0 h-2 w-0.5 bg-gray-400"
          style={{ left: "50%" }}
        />
        <div
          className="absolute top-0 h-2 bg-blue-500 rounded-full transition-all"
          style={{
            left: value >= 0 ? "50%" : `${pct}%`,
            width: `${Math.abs(value) * 50}%`,
          }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
        <span>保守 / タカ派</span>
        <span>革新 / ハト派</span>
      </div>
    </div>
  );
}

export default function ScoreCard({ article, index, highlighted = false }: Props) {
  const { scores, emotionalTone, biasWarning, summary, counterOpinion, confidence } =
    article.analysis;

  return (
    <div
      className={`bg-white rounded-xl border p-4 shadow-sm transition-all duration-300 ${
        highlighted
          ? "border-blue-400 ring-2 ring-blue-300 ring-offset-1"
          : "border-gray-200"
      }`}
    >
      {/* ヘッダー */}
      <div className="flex items-start gap-2 mb-3">
        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">
          {index + 1}
        </span>
        <div>
          <h3 className="text-sm font-semibold text-gray-800 leading-tight">
            {article.title}
          </h3>
          {article.source && (
            <span className="text-[10px] text-gray-400">{article.source}</span>
          )}
        </div>
      </div>

      {/* 煽情警告 */}
      {biasWarning && (
        <div className="mb-3 flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
          <span className="text-amber-500 text-base">⚠️</span>
          <p className="text-xs text-amber-700">
            感情的トーンが強い記事です。情報を客観的に精査することをお勧めします。
          </p>
        </div>
      )}

      {/* スコアバー */}
      <div className="mb-3">
        <ScoreBar value={scores.economic} label="経済軸" />
        <ScoreBar value={scores.social} label="社会軸" />
        <ScoreBar value={scores.diplomatic} label="外交安保軸" />
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>感情トーン</span>
          <span className="font-mono">{emotionalTone.toFixed(2)}</span>
        </div>
      </div>

      {/* 信頼度 */}
      <div className="flex items-center gap-1 mb-3">
        <span className="text-[10px] text-gray-400">分析信頼度</span>
        <div className="flex gap-0.5">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-sm ${
                i < Math.round(confidence * 5) ? "bg-blue-400" : "bg-gray-200"
              }`}
            />
          ))}
        </div>
        <span className="text-[10px] text-gray-400">{Math.round(confidence * 100)}%</span>
      </div>

      {/* 要約 */}
      <div className="mb-3">
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
          要約
        </p>
        <p className="text-xs text-gray-700 leading-relaxed">{summary}</p>
      </div>

      {/* カウンターオピニオン */}
      <div className="rounded-lg bg-indigo-50 border border-indigo-100 px-3 py-2">
        <p className="text-[11px] font-semibold text-indigo-500 mb-1">
          💡 カウンター・オピニオン
        </p>
        <p className="text-xs text-indigo-800 leading-relaxed">{counterOpinion}</p>
      </div>
    </div>
  );
}
