"use client";

import { useEffect, useRef } from "react";
import * as d3 from "d3";
import type { AnalyzedArticle, NewsGroup } from "@/types";
import { getChartColor } from "@/lib/source-colors";

interface Props {
  group: NewsGroup;
  results: AnalyzedArticle[];
}

function getSourceColor(source: string, allSources: string[]) {
  return getChartColor(source, allSources);
}

// ── スコア比較表 ───────────────────────────────────────

function ScoreTable({ results, allSources }: { results: AnalyzedArticle[]; allSources: string[] }) {
  const axes = [
    { key: "economic" as const,   label: "経済軸",   lo: "保守", hi: "革新" },
    { key: "social" as const,     label: "社会軸",   lo: "伝統", hi: "多様性" },
    { key: "diplomatic" as const, label: "外交安保軸", lo: "タカ派", hi: "ハト派" },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr>
            <th className="text-left px-4 py-3 font-semibold text-gray-600 border-b border-gray-200 bg-gray-50/50 w-28">媒体</th>
            {axes.map((ax) => (
              <th key={ax.key} className="px-4 py-3 font-semibold text-gray-600 border-b border-gray-200 bg-gray-50/50 text-center">
                {ax.label}
                <div className="text-[9px] text-gray-400 font-normal mt-0.5">{ax.lo} ↔ {ax.hi}</div>
              </th>
            ))}
            <th className="px-4 py-3 font-semibold text-gray-600 border-b border-gray-200 bg-gray-50/50 text-center w-20">感情</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r, i) => {
            const color = getSourceColor(r.source ?? "", allSources);
            return (
              <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                    <span className="font-semibold" style={{ color }}>{r.source}</span>
                  </div>
                </td>
                {axes.map((ax) => {
                  const val = r.analysis.scores[ax.key];
                  const pct = ((val + 1) / 2) * 100;
                  return (
                    <td key={ax.key} className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="absolute top-0 left-1/2 w-px h-2.5 bg-gray-300" />
                          <div
                            className="absolute top-0 h-2.5 rounded-full transition-all"
                            style={{
                              backgroundColor: color,
                              opacity: 0.8,
                              left: val >= 0 ? "50%" : `${pct}%`,
                              width: `${Math.abs(val) * 50}%`,
                            }}
                          />
                        </div>
                        <span className="font-mono text-[10px] text-gray-500 w-8 text-right">
                          {val.toFixed(2)}
                        </span>
                      </div>
                    </td>
                  );
                })}
                <td className="px-4 py-3 text-center">
                  <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${
                    r.analysis.emotionalTone > 0.3 ? "bg-green-50 text-green-600" :
                    r.analysis.emotionalTone < -0.3 ? "bg-red-50 text-red-500" : "bg-gray-50 text-gray-400"
                  }`}>
                    {r.analysis.emotionalTone > 0.3 ? "😊" :
                     r.analysis.emotionalTone < -0.3 ? "😠" : "😐"}
                    {r.analysis.emotionalTone.toFixed(2)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── ポジショニングプロット（2軸） ─────────────────────

const SIZE = 320;
const M = { top: 30, right: 16, bottom: 40, left: 48 };

type PlotDef = {
  title: string;
  xKey: "economic" | "social" | "diplomatic";
  yKey: "economic" | "social" | "diplomatic";
  xLabel: string;
  yLabel: string;
  quadrants: [string, string, string, string];
};

const PLOTS: PlotDef[] = [
  {
    title: "社会 × 経済",
    xKey: "economic", yKey: "social",
    xLabel: "← 保守（経済）　革新 →",
    yLabel: "← 伝統　多様性 →",
    quadrants: ["保守・伝統", "革新・伝統", "保守・多様性", "革新・多様性"],
  },
  {
    title: "外交安保 × 経済",
    xKey: "economic", yKey: "diplomatic",
    xLabel: "← 保守（経済）　革新 →",
    yLabel: "← タカ派　ハト派 →",
    quadrants: ["保守・タカ派", "革新・タカ派", "保守・ハト派", "革新・ハト派"],
  },
];

function ComparisonPlot({
  results,
  allSources,
  plotDef,
}: {
  results: AnalyzedArticle[];
  allSources: string[];
  plotDef: PlotDef;
}) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const iW = SIZE - M.left - M.right;
    const iH = SIZE - M.top - M.bottom;
    const x = d3.scaleLinear().domain([-1, 1]).range([0, iW]);
    const y = d3.scaleLinear().domain([-1, 1]).range([iH, 0]);

    svg.append("text")
      .attr("x", SIZE / 2).attr("y", 16)
      .attr("text-anchor", "middle")
      .attr("font-size", 11).attr("font-weight", "700").attr("fill", "#374151")
      .text(plotDef.title);

    const g = svg.append("g").attr("transform", `translate(${M.left},${M.top})`);

    // 象限背景
    const qColors = ["#fef9c3", "#dbeafe", "#fee2e2", "#d1fae5"];
    [[-1,0],[0,0],[-1,-1],[0,-1]].forEach(([qx, qy], qi) => {
      g.append("rect")
        .attr("x", x(qx)).attr("y", y(qy + 1))
        .attr("width", x(qx + 1) - x(qx)).attr("height", y(qy) - y(qy + 1))
        .attr("fill", qColors[qi]).attr("opacity", 0.35);
    });

    // 象限ラベル
    const [tl, tr, bl, br] = plotDef.quadrants;
    [
      { t: tl, x: x(-0.97), y: y(0.93), a: "start" },
      { t: tr, x: x(0.97),  y: y(0.93), a: "end" },
      { t: bl, x: x(-0.97), y: y(-0.90), a: "start" },
      { t: br, x: x(0.97),  y: y(-0.90), a: "end" },
    ].forEach(({ t, x: px, y: py, a }) => {
      g.append("text").attr("x", px).attr("y", py)
        .attr("text-anchor", a).attr("font-size", 8).attr("fill", "#9ca3af").text(t);
    });

    // グリッド
    [-0.5, 0, 0.5].forEach((v) => {
      const isC = v === 0;
      g.append("line").attr("x1", x(v)).attr("x2", x(v)).attr("y1", 0).attr("y2", iH)
        .attr("stroke", isC ? "#6b7280" : "#e5e7eb")
        .attr("stroke-width", isC ? 1.5 : 0.75)
        .attr("stroke-dasharray", isC ? "none" : "3,3");
      g.append("line").attr("x1", 0).attr("x2", iW).attr("y1", y(v)).attr("y2", y(v))
        .attr("stroke", isC ? "#6b7280" : "#e5e7eb")
        .attr("stroke-width", isC ? 1.5 : 0.75)
        .attr("stroke-dasharray", isC ? "none" : "3,3");
    });

    // 軸ラベル
    g.append("text").attr("x", iW / 2).attr("y", iH + 30)
      .attr("text-anchor", "middle").attr("font-size", 9).attr("fill", "#6b7280")
      .text(plotDef.xLabel);
    g.append("text")
      .attr("transform", `translate(-36,${iH / 2}) rotate(-90)`)
      .attr("text-anchor", "middle").attr("font-size", 9).attr("fill", "#6b7280")
      .text(plotDef.yLabel);

    // プロット点
    results.forEach((r) => {
      const xVal = r.analysis.scores[plotDef.xKey];
      const yVal = r.analysis.scores[plotDef.yKey];
      const color = getSourceColor(r.source ?? "", allSources);

      const pg = g.append("g").attr("transform", `translate(${x(xVal)},${y(yVal)})`);

      // 影
      pg.append("circle").attr("r", 11).attr("fill", color).attr("opacity", 0.15);

      pg.append("circle").attr("r", 9).attr("fill", color).attr("stroke", "white")
        .attr("stroke-width", 2).attr("opacity", 0.9);
      pg.append("text").attr("text-anchor", "middle").attr("dy", "0.35em")
        .attr("font-size", 8).attr("fill", "white").attr("font-weight", "bold")
        .text((r.source ?? "?").slice(0, 2));
    });
  }, [results, allSources, plotDef]);

  return (
    <svg ref={svgRef} width={SIZE} height={SIZE}
      className="bg-white rounded-2xl border border-gray-200 shadow-sm" />
  );
}

// ── メインコンポーネント ──────────────────────────────

export default function MediaComparisonView({ group, results }: Props) {
  const allSources = [...new Set(results.map((r) => r.source ?? ""))];

  // 各軸の最大ギャップを計算
  const gaps = (["economic", "social", "diplomatic"] as const).map((key) => {
    const vals = results.map((r) => r.analysis.scores[key]);
    return Math.max(...vals) - Math.min(...vals);
  });
  const maxGapIdx = gaps.indexOf(Math.max(...gaps));
  const axisLabels = ["経済軸", "社会軸", "外交安保軸"];

  return (
    <div className="space-y-6">
      {/* ヘッダーカード */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
        <h2 className="text-lg font-bold text-gray-900 mb-2">{group.groupTitle}</h2>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-1.5">
            {allSources.map((src) => (
              <span
                key={src}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full text-white"
                style={{ backgroundColor: getSourceColor(src, allSources) }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-white/40" />
                {src}
              </span>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-1.5">
            <span className="text-xs text-amber-800">
              最大ギャップ: <span className="font-bold">{axisLabels[maxGapIdx]}</span>
            </span>
            <span className="text-xs font-mono text-amber-600">{Math.max(...gaps).toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* プロット 2枚 */}
      <div className="flex flex-wrap gap-4 justify-center">
        {PLOTS.map((def, i) => (
          <ComparisonPlot key={i} results={results} allSources={allSources} plotDef={def} />
        ))}
      </div>

      {/* スコア比較表 */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="text-sm font-bold text-gray-700">スコア比較</h3>
        </div>
        <ScoreTable results={results} allSources={allSources} />
      </div>

      {/* 各媒体の要約カード */}
      <div>
        <h3 className="text-sm font-bold text-gray-700 mb-3">各媒体の報道内容</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {results.map((r, i) => {
            const color = getSourceColor(r.source ?? "", allSources);
            return (
              <div key={i} className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow">
                {/* 媒体ヘッダー */}
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-sm font-bold" style={{ color }}>{r.source}</span>
                  {r.analysis.biasWarning && (
                    <span className="ml-auto text-[10px] font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                      ⚠️ 煽情的
                    </span>
                  )}
                </div>

                {/* タイトル */}
                <p className="text-xs font-semibold text-gray-800 mb-2 leading-snug line-clamp-2">
                  {r.title}
                </p>

                {/* 要約 */}
                <p className="text-xs text-gray-600 leading-relaxed mb-3">{r.analysis.summary}</p>

                {/* カウンターオピニオン */}
                <div className="rounded-xl bg-indigo-50 border border-indigo-100 px-3 py-2.5">
                  <p className="text-[10px] font-bold text-indigo-500 mb-0.5">💡 カウンター・オピニオン</p>
                  <p className="text-[11px] text-indigo-800 leading-relaxed">{r.analysis.counterOpinion}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
