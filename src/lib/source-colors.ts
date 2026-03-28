/**
 * ソース名に対するカラー設定を返すユーティリティ。
 * 主要媒体はブランドカラーで固定、未知の媒体はハッシュで自動生成。
 * Tailwind v4 の動的クラス名問題を回避するため inline style 用の CSS 値を返す。
 */

export interface SourceColors {
  bgColor: string;
  textColor: string;
  dotColor: string;
  borderColor: string;
}

// 主要媒体の固定カラー
const KNOWN_SOURCES: Record<string, SourceColors> = {
  "NHK政治":            { bgColor: "#fef2f2", textColor: "#dc2626", dotColor: "#ef4444", borderColor: "#fecaca" },
  "NHK国際":            { bgColor: "#fff7ed", textColor: "#ea580c", dotColor: "#f97316", borderColor: "#fed7aa" },
  "NHK経済":            { bgColor: "#fefce8", textColor: "#a16207", dotColor: "#ca8a04", borderColor: "#fef08a" },
  "NHK社会":            { bgColor: "#fdf4ff", textColor: "#9333ea", dotColor: "#a855f7", borderColor: "#e9d5ff" },
  "朝日新聞":            { bgColor: "#eff6ff", textColor: "#1d4ed8", dotColor: "#3b82f6", borderColor: "#bfdbfe" },
  "産経新聞":            { bgColor: "#fff1f2", textColor: "#be123c", dotColor: "#f43f5e", borderColor: "#fecdd3" },
  "東洋経済オンライン":  { bgColor: "#f0fdf4", textColor: "#15803d", dotColor: "#22c55e", borderColor: "#bbf7d0" },
  "ロイター日本語":      { bgColor: "#fff7ed", textColor: "#c2410c", dotColor: "#fb923c", borderColor: "#fed7aa" },
  "ハフポスト日本版":    { bgColor: "#ecfdf5", textColor: "#065f46", dotColor: "#10b981", borderColor: "#a7f3d0" },
  "日経新聞":            { bgColor: "#fef9c3", textColor: "#92400e", dotColor: "#d97706", borderColor: "#fde68a" },
};

// 前方一致マッピング（"NHK" で始まる未知ソース等に対応）
const PREFIX_SOURCES: [string, SourceColors][] = [
  ["NHK",  { bgColor: "#fef2f2", textColor: "#dc2626", dotColor: "#ef4444", borderColor: "#fecaca" }],
  ["読売",  { bgColor: "#f0fdf4", textColor: "#166534", dotColor: "#16a34a", borderColor: "#bbf7d0" }],
  ["毎日",  { bgColor: "#f5f3ff", textColor: "#6d28d9", dotColor: "#7c3aed", borderColor: "#ddd6fe" }],
  ["日経",  { bgColor: "#fef9c3", textColor: "#92400e", dotColor: "#d97706", borderColor: "#fde68a" }],
  ["産経",  { bgColor: "#fff1f2", textColor: "#be123c", dotColor: "#f43f5e", borderColor: "#fecdd3" }],
  ["朝日",  { bgColor: "#eff6ff", textColor: "#1d4ed8", dotColor: "#3b82f6", borderColor: "#bfdbfe" }],
  ["TBS",   { bgColor: "#f0f9ff", textColor: "#0369a1", dotColor: "#0ea5e9", borderColor: "#bae6fd" }],
  ["NNN",   { bgColor: "#f5f3ff", textColor: "#5b21b6", dotColor: "#7c3aed", borderColor: "#ddd6fe" }],
  ["CNN",   { bgColor: "#fff0f0", textColor: "#cc0000", dotColor: "#ef4444", borderColor: "#fecaca" }],
  ["BBC",   { bgColor: "#eff6ff", textColor: "#1e3a8a", dotColor: "#2563eb", borderColor: "#bfdbfe" }],
];

function stringToHue(str: string): number {
  let hash = 5381;
  for (const c of str) {
    hash = (hash * 33) ^ c.charCodeAt(0);
  }
  return Math.abs(hash) % 360;
}

export function getSourceColors(sourceName: string): SourceColors {
  if (KNOWN_SOURCES[sourceName]) return KNOWN_SOURCES[sourceName];

  for (const [prefix, colors] of PREFIX_SOURCES) {
    if (sourceName.startsWith(prefix)) return colors;
  }

  // 未知ソース: ハッシュから HSL 自動生成
  const hue = stringToHue(sourceName);
  return {
    bgColor:     `hsl(${hue}, 55%, 96%)`,
    textColor:   `hsl(${hue}, 65%, 32%)`,
    dotColor:    `hsl(${hue}, 60%, 52%)`,
    borderColor: `hsl(${hue}, 45%, 87%)`,
  };
}

/** D3 散布図など、単色が必要な場合用 */
const CHART_PALETTE = [
  "#ef4444", "#3b82f6", "#f97316", "#10b981", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f59e0b", "#6366f1", "#84cc16",
];

export function getChartColor(source: string, allSources: string[]): string {
  const idx = allSources.indexOf(source);
  if (idx !== -1) return CHART_PALETTE[idx % CHART_PALETTE.length];
  return CHART_PALETTE[Math.abs(stringToHue(source)) % CHART_PALETTE.length];
}
