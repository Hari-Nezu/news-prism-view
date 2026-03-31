"use client";

import { useEffect, useRef } from "react";
import * as d3 from "d3";
import type { AnalyzedArticle } from "@/types";
import type { MultiModelAnalyzedArticle } from "@/types";

const MODEL_COLORS: Record<string, string> = {
  "gemma3:12b":  "#ef4444",
  "qwen3.5:4b":  "#22c55e",
  "llama3.2":    "#a855f7",
};

const MODEL_LABELS: Record<string, string> = {
  "gemma3:12b":  "Gemma 3",
  "qwen3.5:4b":  "Qwen 3.5",
  "llama3.2":    "Llama 3.2",
};

interface Props {
  articles: AnalyzedArticle[];
  selectedIndex?: number;
  onSelect?: (index: number) => void;
}

const SIZE = 340;
const MARGIN = { top: 36, right: 16, bottom: 44, left: 52 };

type PlotConfig = {
  title: string;
  xKey: "economic" | "social" | "diplomatic";
  yKey: "economic" | "social" | "diplomatic";
  xLabel: string;
  yLabel: string;
  quadrantLabels: [string, string, string, string]; // TL, TR, BL, BR
  quadrantColors: [string, string, string, string];
};

const PLOTS: PlotConfig[] = [
  {
    title: "社会軸 × 経済軸",
    xKey: "economic",
    yKey: "social",
    xLabel: "← 保守（経済）　　革新 →",
    yLabel: "社会軸",
    quadrantLabels: ["保守・伝統", "革新・伝統", "保守・多様性", "革新・多様性"],
    quadrantColors: ["#fef3c7", "#dbeafe", "#fee2e2", "#d1fae5"],
  },
  {
    title: "外交安保軸 × 経済軸",
    xKey: "economic",
    yKey: "diplomatic",
    xLabel: "← 保守（経済）　　革新 →",
    yLabel: "外交安保軸",
    quadrantLabels: ["保守・タカ派", "革新・タカ派", "保守・ハト派", "革新・ハト派"],
    quadrantColors: ["#fef3c7", "#dbeafe", "#fee2e2", "#d1fae5"],
  },
];

const AXIS_END_LABELS: Record<PlotConfig["yKey"], [string, string]> = {
  social:     ["← 伝統", "多様性 →"],
  diplomatic: ["← タカ派", "ハト派 →"],
  economic:   ["← 保守", "革新 →"],
};

function drawPlot(
  svgEl: SVGSVGElement,
  config: PlotConfig,
  articles: AnalyzedArticle[],
  selectedIndex: number | undefined,
  onSelect: ((i: number) => void) | undefined
) {
  const svg = d3.select(svgEl);
  svg.selectAll("*").remove();

  const innerW = SIZE - MARGIN.left - MARGIN.right;
  const innerH = SIZE - MARGIN.top - MARGIN.bottom;

  const xScale = d3.scaleLinear().domain([-1, 1]).range([0, innerW]);
  const yScale = d3.scaleLinear().domain([-1, 1]).range([innerH, 0]);

  const g = svg
    .append("g")
    .attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

  // タイトル
  svg.append("text")
    .attr("x", SIZE / 2).attr("y", 18)
    .attr("text-anchor", "middle")
    .attr("font-size", 12).attr("font-weight", "600")
    .attr("fill", "#374151")
    .text(config.title);

  // 象限背景
  const [tlColor, trColor, blColor, brColor] = config.quadrantColors;
  [
    { x: -1, y: 0, w: 1, h: 1, color: tlColor },
    { x: 0,  y: 0, w: 1, h: 1, color: trColor },
    { x: -1, y: -1, w: 1, h: 1, color: blColor },
    { x: 0,  y: -1, w: 1, h: 1, color: brColor },
  ].forEach(({ x, y, w, h, color }) => {
    g.append("rect")
      .attr("x", xScale(x))
      .attr("y", yScale(y + h))
      .attr("width", xScale(x + w) - xScale(x))
      .attr("height", yScale(y) - yScale(y + h))
      .attr("fill", color)
      .attr("opacity", 0.45);
  });

  // 象限ラベル（薄字）
  const [tl, tr, bl, br] = config.quadrantLabels;
  [
    { text: tl, x: xScale(-0.98), y: yScale(0.95), anchor: "start" },
    { text: tr, x: xScale(0.98),  y: yScale(0.95), anchor: "end" },
    { text: bl, x: xScale(-0.98), y: yScale(-0.92), anchor: "start" },
    { text: br, x: xScale(0.98),  y: yScale(-0.92), anchor: "end" },
  ].forEach(({ text, x, y, anchor }) => {
    g.append("text")
      .attr("x", x).attr("y", y)
      .attr("text-anchor", anchor)
      .attr("font-size", 9).attr("fill", "#9ca3af")
      .text(text);
  });

  // グリッド線
  [-0.5, 0, 0.5].forEach((v) => {
    const isCenter = v === 0;
    g.append("line")
      .attr("x1", xScale(v)).attr("x2", xScale(v))
      .attr("y1", 0).attr("y2", innerH)
      .attr("stroke", isCenter ? "#6b7280" : "#e5e7eb")
      .attr("stroke-width", isCenter ? 1.5 : 0.75)
      .attr("stroke-dasharray", isCenter ? "none" : "4,3");

    g.append("line")
      .attr("x1", 0).attr("x2", innerW)
      .attr("y1", yScale(v)).attr("y2", yScale(v))
      .attr("stroke", isCenter ? "#6b7280" : "#e5e7eb")
      .attr("stroke-width", isCenter ? 1.5 : 0.75)
      .attr("stroke-dasharray", isCenter ? "none" : "4,3");
  });

  // X軸ラベル
  g.append("text")
    .attr("x", innerW / 2).attr("y", innerH + 34)
    .attr("text-anchor", "middle")
    .attr("font-size", 10).attr("fill", "#6b7280")
    .text(config.xLabel);

  // Y軸ラベル
  const [yLo, yHi] = AXIS_END_LABELS[config.yKey];
  g.append("text")
    .attr("transform", `translate(-38,${innerH / 2}) rotate(-90)`)
    .attr("text-anchor", "middle")
    .attr("font-size", 10).attr("fill", "#6b7280")
    .text(`${yLo}　${yHi}`);

  // スケール目盛り
  [-1, -0.5, 0, 0.5, 1].forEach((v) => {
    g.append("text")
      .attr("x", xScale(v)).attr("y", innerH + 14)
      .attr("text-anchor", "middle")
      .attr("font-size", 8).attr("fill", "#d1d5db")
      .text(v.toFixed(1));

    g.append("text")
      .attr("x", -8).attr("y", yScale(v) + 3)
      .attr("text-anchor", "end")
      .attr("font-size", 8).attr("fill", "#d1d5db")
      .text(v.toFixed(1));
  });

  // プロット点
  articles.forEach((article, i) => {
    const xVal = article.analysis.scores[config.xKey];
    const yVal = article.analysis.scores[config.yKey];
    const cx = xScale(xVal);
    const cy = yScale(yVal);
    const isSelected = i === selectedIndex;

    // マルチモデル: 三角形 + 個別ドット
    const mm = (article as MultiModelAnalyzedArticle).multiModel;
    if (mm && mm.results.length > 1) {
      const points = mm.results.map((r) => ({
        x: xScale(r.scores[config.xKey]),
        y: yScale(r.scores[config.yKey]),
        model: r.model,
      }));

      // 三角形（モデル間のばらつき可視化）
      if (points.length >= 3) {
        g.append("polygon")
          .attr("points", points.map((p) => `${p.x},${p.y}`).join(" "))
          .attr("fill", isSelected ? "#3b82f6" : "#6b7280")
          .attr("fill-opacity", 0.08)
          .attr("stroke", isSelected ? "#3b82f6" : "#9ca3af")
          .attr("stroke-opacity", 0.3)
          .attr("stroke-width", 1);
      } else {
        // 2モデルの場合は線で繋ぐ
        g.append("line")
          .attr("x1", points[0].x).attr("y1", points[0].y)
          .attr("x2", points[1].x).attr("y2", points[1].y)
          .attr("stroke", isSelected ? "#3b82f6" : "#9ca3af")
          .attr("stroke-opacity", 0.3)
          .attr("stroke-width", 1);
      }

      // 各モデルの小ドット
      points.forEach((p) => {
        const color = MODEL_COLORS[p.model] ?? "#6b7280";
        g.append("circle")
          .attr("cx", p.x).attr("cy", p.y)
          .attr("r", 4)
          .attr("fill", color)
          .attr("stroke", "white")
          .attr("stroke-width", 1)
          .attr("opacity", isSelected ? 1 : 0.7);
      });
    }

    // コンセンサス点（番号付き）
    const pointG = g.append("g")
      .attr("transform", `translate(${cx},${cy})`)
      .style("cursor", "pointer")
      .on("click", () => onSelect?.(i));

    if (isSelected) {
      pointG.append("circle")
        .attr("r", 15)
        .attr("fill", "none")
        .attr("stroke", "#1d4ed8")
        .attr("stroke-width", 2);
    }

    pointG.append("circle")
      .attr("r", isSelected ? 10 : 8)
      .attr("fill", isSelected ? "#1d4ed8" : "#64748b")
      .attr("stroke", "white")
      .attr("stroke-width", 1.5)
      .attr("opacity", isSelected ? 1 : 0.75);

    pointG.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .attr("font-size", 9)
      .attr("fill", "white")
      .attr("font-weight", "bold")
      .text(i + 1);
  });

  // マルチモデル凡例（少なくとも1記事がmultiModelを持つ場合）
  const hasMultiModel = articles.some((a) => (a as MultiModelAnalyzedArticle).multiModel?.results?.length);
  if (hasMultiModel) {
    const legendG = svg.append("g")
      .attr("transform", `translate(${MARGIN.left}, ${SIZE - 8})`);

    const models = Object.entries(MODEL_COLORS);
    models.forEach(([model, color], idx) => {
      const x = idx * 80;
      legendG.append("circle")
        .attr("cx", x).attr("cy", 0)
        .attr("r", 3)
        .attr("fill", color);
      legendG.append("text")
        .attr("x", x + 6).attr("y", 3)
        .attr("font-size", 8)
        .attr("fill", "#9ca3af")
        .text(MODEL_LABELS[model] ?? model);
    });
  }
}

export default function PositioningPlot({ articles, selectedIndex, onSelect }: Props) {
  const svgRefs = [useRef<SVGSVGElement>(null), useRef<SVGSVGElement>(null)];

  useEffect(() => {
    PLOTS.forEach((config, idx) => {
      const el = svgRefs[idx].current;
      if (el) drawPlot(el, config, articles, selectedIndex, onSelect);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articles, selectedIndex, onSelect]);

  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="flex flex-wrap gap-4 justify-center">
        {PLOTS.map((_, idx) => (
          <svg
            key={idx}
            ref={svgRefs[idx]}
            width={SIZE}
            height={SIZE}
            className="bg-white rounded-xl border border-gray-200 shadow-sm"
          />
        ))}
      </div>
    </div>
  );
}
