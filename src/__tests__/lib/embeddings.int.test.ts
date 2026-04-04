import { describe, it, expect, beforeAll } from "vitest";
import { embedBatch, embed } from "@/lib/embeddings";
import { LLM_BASE_URL, EMBED_MODEL } from "@/lib/config";

/**
 * 実際の Ollama API を呼び出して検証する統合テスト
 * 
 * 実行方法:
 *   npx vitest src/__tests__/lib/embeddings.int.ts
 */
describe("embeddings integration (llama.cpp)", () => {
  const isIntegration = !!process.env.INTEGRATION;

  beforeAll(async () => {
    if (!isIntegration) return;
    // Ollama が起動しているか軽くチェック
    try {
      const res = await fetch(`${LLM_BASE_URL}/v1/models`);
      if (!res.ok) throw new Error();
    } catch {
      console.warn("⚠️  llama.cpp is not running. Integration tests might fail.");
    }
    console.log(`Using model: ${EMBED_MODEL} at ${LLM_BASE_URL}`);
  });

  describe("embed", () => {
    it.skipIf(!isIntegration)("実際にベクトルが返ってくるか", async () => {
      const vec = await embed("これはテストです。実際に埋め込みを取得します。");
      expect(vec).toBeInstanceOf(Array);
      expect(vec?.length).toBeGreaterThan(0);
      console.log("Single embedding length:", vec?.length);
    });

    it.skipIf(!isIntegration)("有効な入力でベクトルが返ってくるか", async () => {
      const vec = await embed("test");
      expect(vec).not.toBeNull();
      expect(vec).toBeInstanceOf(Array);
    });
  });

  describe("embedBatch", () => {
    it.skipIf(!isIntegration)("複数のテキストを一括でベクトル化できるか", async () => {
      const texts = [
        "今日はとても良い天気ですね。",
        "明日の天気予報は雨です。",
        "最近、AIの進化が目覚ましいです。"
      ];
      
      const results = await embedBatch(texts);
      expect(results).toHaveLength(texts.length);
      
      results.forEach((vec, i) => {
        expect(vec).toBeInstanceOf(Array);
        expect(vec?.length).toBeGreaterThan(0);
        console.log(`Batch embedding [${i}] length:`, vec?.length);
      });
    });

    it.skipIf(!isIntegration)("大量のテキストをバッチ処理できるか（モデルの上限に注意）", async () => {
      const texts = Array.from({ length: 10 }, (_, i) => `テスト文章その${i}`);
      const results = await embedBatch(texts);
      expect(results).toHaveLength(10);
      expect(results.every(v => v !== null)).toBe(true);
    });
  });
});
