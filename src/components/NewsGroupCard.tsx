import type { NewsGroup } from "@/types";
import { getSourceColors } from "@/lib/source-colors";

interface Props {
  group: NewsGroup;
  index: number;
  onSelect: (group: NewsGroup) => void;
}

export default function NewsGroupCard({ group, index, onSelect }: Props) {
  const sources = [...new Set(group.items.map((i) => i.source))];
  const latestDate = group.items
    .map((i) => i.publishedAt)
    .filter(Boolean)
    .sort()
    .at(-1);

  return (
    <button
      onClick={() => onSelect(group)}
      className={`w-full text-left rounded-2xl border p-5 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 ${
        group.singleOutlet
          ? "border-gray-200 bg-gray-50/50 opacity-60 hover:opacity-80"
          : "border-gray-200 bg-white hover:border-purple-300"
      }`}
    >
      {/* ヘッダー */}
      <div className="flex items-start gap-3 mb-3">
        <span className="flex-shrink-0 w-7 h-7 rounded-xl bg-purple-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-gray-900 leading-snug">
            {group.groupTitle}
          </h3>
          <div className="flex items-center gap-2 mt-1">
            {latestDate && (
              <span className="text-[10px] text-gray-400">
                {new Date(latestDate).toLocaleString("ja-JP", {
                  month: "numeric",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
            {group.singleOutlet && (
              <span className="text-[9px] bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded-full">
                1媒体のみ
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 媒体バッジ */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {sources.map((src) => {
          const c = getSourceColors(src);
          return (
            <span
              key={src}
              className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: c.bgColor, color: c.textColor }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: c.dotColor }}
              />
              {src}
            </span>
          );
        })}
      </div>

      {/* 記事タイトル */}
      <ul className="space-y-1.5">
        {group.items.map((item, i) => {
          const c = getSourceColors(item.source);
          return (
            <li key={i} className="flex items-start gap-2">
              <span
                className="flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded mt-0.5"
                style={{ backgroundColor: c.bgColor, color: c.textColor }}
              >
                {item.source.slice(0, 3)}
              </span>
              <p className="text-xs text-gray-600 leading-snug line-clamp-1">{item.title}</p>
            </li>
          );
        })}
      </ul>

      {/* フッター */}
      {!group.singleOutlet && (
        <div className="mt-4 pt-3 border-t border-gray-100">
          <p className="text-xs text-purple-600 font-semibold text-right">
            {sources.length}媒体の報道色を比較する →
          </p>
        </div>
      )}
    </button>
  );
}
