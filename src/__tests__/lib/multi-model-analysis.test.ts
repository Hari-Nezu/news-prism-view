import { describe, it, expect } from "vitest";
import { computeMultiModelAnalysis } from "@/lib/multi-model-analysis";
import type { ModelAnalysisResult } from "@/types";

function makeResult(
  economic: number,
  social: number,
  diplomatic: number,
  model = "model-a"
): ModelAnalysisResult {
  return {
    model,
    scores: { economic, social, diplomatic },
    emotionalTone: 0,
    biasWarning: false,
    summary: "",
    counterOpinion: "",
    confidence: 1,
  };
}

describe("computeMultiModelAnalysis", () => {
  it("1モデルの場合: consensus = そのモデルのスコア、variance = 全軸0", () => {
    const result = computeMultiModelAnalysis([makeResult(0.5, -0.3, 0.1)]);
    expect(result.consensus.economic).toBeCloseTo(0.5);
    expect(result.consensus.social).toBeCloseTo(-0.3);
    expect(result.consensus.diplomatic).toBeCloseTo(0.1);
    expect(result.variance.economic).toBeCloseTo(0);
    expect(result.variance.social).toBeCloseTo(0);
    expect(result.variance.diplomatic).toBeCloseTo(0);
  });

  it("2モデルの場合: consensus = 平均、variance = 正しい分散値", () => {
    const result = computeMultiModelAnalysis([
      makeResult(0, 0, 0, "model-a"),
      makeResult(1, 0, 0, "model-b"),
    ]);
    expect(result.consensus.economic).toBeCloseTo(0.5);
    expect(result.variance.economic).toBeCloseTo(0.25);
    expect(result.variance.social).toBeCloseTo(0);
  });

  it("3モデルで経済軸のみ大きく乖離 → maxDivergenceAxis = '経済軸'", () => {
    const result = computeMultiModelAnalysis([
      makeResult(-1, 0, 0, "a"),
      makeResult(0, 0, 0, "b"),
      makeResult(1, 0, 0, "c"),
    ]);
    expect(result.maxDivergenceAxis).toBe("経済軸");
  });

  it("社会軸が最大乖離 → maxDivergenceAxis = '社会軸'", () => {
    const result = computeMultiModelAnalysis([
      makeResult(0, -1, 0, "a"),
      makeResult(0, 1, 0, "b"),
      makeResult(0, 0, 0, "c"),
    ]);
    expect(result.maxDivergenceAxis).toBe("社会軸");
  });

  it("外交軸が最大乖離 → maxDivergenceAxis = '外交安保軸'", () => {
    const result = computeMultiModelAnalysis([
      makeResult(0, 0, -1, "a"),
      makeResult(0, 0, 1, "b"),
    ]);
    expect(result.maxDivergenceAxis).toBe("外交安保軸");
  });

  it("全軸同じ分散 → maxDivergenceAxis は '経済軸'（reduce の挙動で economic が残る）", () => {
    const result = computeMultiModelAnalysis([
      makeResult(-1, -1, -1, "a"),
      makeResult(1, 1, 1, "b"),
    ]);
    // reduce は a >= b で a を返すので最初の economic が残る
    expect(result.maxDivergenceAxis).toBe("経済軸");
  });
});
