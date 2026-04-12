import type { ModelAnalysisResult, MultiModelAnalysis, AxisScore } from "@/types";

/** ModelAnalysisResult[] からコンセンサス・分散を計算 */
export function computeMultiModelAnalysis(results: ModelAnalysisResult[]): MultiModelAnalysis {
  const axes: (keyof AxisScore)[] = ["economic", "social", "diplomatic"];
  const consensus: AxisScore = { economic: 0, social: 0, diplomatic: 0 };
  const variance: AxisScore = { economic: 0, social: 0, diplomatic: 0 };

  for (const axis of axes) {
    const values = results.map((r) => r.scores[axis]);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    consensus[axis] = mean;
    variance[axis] = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  }

  const maxAxis = axes.reduce((a, b) => (variance[a] >= variance[b] ? a : b));
  const axisLabels: Record<string, string> = { economic: "経済軸", social: "社会軸", diplomatic: "外交安保軸" };

  return { results, consensus, variance, maxDivergenceAxis: axisLabels[maxAxis] };
}
