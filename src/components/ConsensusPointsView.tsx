import type { NewsGroup } from "@/types";
import { getSourceColors } from "@/lib/source-colors";
import { MEDIA } from "@/lib/media-matcher";
import { groupItemsBySource } from "@/lib/group-items-by-source";
import { formatRelative } from "@/lib/format-time";

interface Props {
  group: NewsGroup;
}

function getShortName(source: string): string | null {
  const entry = MEDIA.find((m) => m.match(source));
  return entry ? entry.short : null;
}

function badgeClass(count: number, total: number): string {
  if (count === total) return "bg-emerald-100 text-emerald-700";
  if (count > total / 2) return "bg-sky-100 text-sky-700";
  if (count > 1) return "bg-amber-100 text-amber-700";
  return "bg-gray-100 text-gray-500";
}

export default function ConsensusPointsView({ group }: Props) {
  const points = group.consensusPoints ?? [];
  const totalSources = new Set((group.items ?? []).map((i) => i.source)).size;

  return (
    <div className="p-4 space-y-3">
      {points.map((pt, idx) => {
        const count = Math.min(pt.sources.length, totalSources);
        return (
          <div key={idx} className="flex gap-3 items-start">
            <span
              className={`flex-shrink-0 text-[11px] font-bold tabular-nums px-1.5 py-0.5 rounded-md leading-tight ${badgeClass(count, totalSources)}`}
            >
              {count}/{totalSources}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-800 leading-snug mb-1.5">{pt.fact}</p>
              <div className="flex flex-wrap gap-1">
                {pt.sources.map((src) => {
                  const colors = getSourceColors(src);
                  return (
                    <span
                      key={src}
                      className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full border"
                      style={{
                        backgroundColor: colors.bgColor,
                        color: colors.textColor,
                        borderColor: colors.borderColor,
                      }}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: colors.dotColor }}
                      />
                      {getShortName(src) ? `${getShortName(src)} ` : ""}{src}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}

      {/* 元記事（折りたたみ） */}
      <details className="mt-2">
        <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 select-none">
          ▶ 元記事を表示（{(group.items ?? []).length}件）
        </summary>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from(groupItemsBySource(group.items ?? [])).map(([source, items]) => {
            const colors = getSourceColors(source);
            return (
              <div
                key={source}
                className="border border-gray-100 rounded-lg overflow-hidden"
                style={{ borderLeftColor: colors.dotColor, borderLeftWidth: "3px" }}
              >
                <div className="flex items-center gap-1.5 px-3 py-2 bg-gray-50/60">
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: colors.dotColor }}
                  />
                  <span className="text-[11px] font-bold truncate" style={{ color: colors.textColor }}>
                    {source}
                  </span>
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
      </details>
    </div>
  );
}
