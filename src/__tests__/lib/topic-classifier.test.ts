import { describe, it, expect } from "vitest";
import { classifyTopic, getTopicDef, TOPICS, TOPIC_ORDER } from "@/lib/topic-classifier";

describe("classifyTopic", () => {
  it("災害キーワードで disaster を返す", () => {
    expect(classifyTopic("能登半島で震度6強の地震 住民が避難")).toBe("disaster");
    expect(classifyTopic("台風10号が接近、大雨警報")).toBe("disaster");
  });

  it("スポーツキーワードで sports を返す", () => {
    expect(classifyTopic("侍ジャパン、野球ワールドカップで優勝")).toBe("sports");
    expect(classifyTopic("オリンピック代表選考レース")).toBe("sports");
  });

  it("健康キーワードで health を返す", () => {
    expect(classifyTopic("新型コロナ感染者が急増、厚生労働省が対策を発表")).toBe("health");
    expect(classifyTopic("新薬が臨床試験で有効性を確認")).toBe("health");
  });

  it("政治・外交キーワードで politics を返す", () => {
    expect(classifyTopic("国会で法案が可決、首相が署名")).toBe("politics");
    expect(classifyTopic("自民党、選挙公約を発表")).toBe("politics");
    expect(classifyTopic("日米同盟、防衛費増額で合意")).toBe("politics");
    expect(classifyTopic("防衛省、ミサイル防衛体制を強化")).toBe("politics");
  });

  it("経済キーワードで economy を返す", () => {
    expect(classifyTopic("日銀が金利0.5%に引き上げ")).toBe("economy");
    expect(classifyTopic("株価が急落、円安加速")).toBe("economy");
    expect(classifyTopic("賃上げ率が過去最高水準に")).toBe("economy");
  });

  it("ビジネスキーワードで business を返す", () => {
    expect(classifyTopic("トヨタが第2四半期決算を発表、増収増益")).toBe("business");
    expect(classifyTopic("スタートアップがIPOを申請")).toBe("business");
  });

  it("科学技術キーワードで science_tech を返す", () => {
    expect(classifyTopic("生成AIの規制を巡る議論が加速")).toBe("science_tech");
    expect(classifyTopic("国産半導体工場が稼働開始")).toBe("science_tech");
  });

  it("文化ライフスタイルキーワードで culture_lifestyle を返す", () => {
    expect(classifyTopic("新しいアニメ映画が興行収入1位")).toBe("culture_lifestyle");
    expect(classifyTopic("三ツ星レストランが新料理を発表")).toBe("culture_lifestyle");
  });

  it("社会キーワードで society を返す", () => {
    expect(classifyTopic("殺人事件で容疑者を逮捕")).toBe("society");
    expect(classifyTopic("交通事故で運転手を書類送検")).toBe("society");
  });

  it("天気キーワードで weather を返す", () => {
    expect(classifyTopic("本日の天気は晴れのち雨")).toBe("weather");
    expect(classifyTopic("都内で真夏日を記録")).toBe("weather");
  });

  it("キーワード未一致で other を返す", () => {
    expect(classifyTopic("意味不明な文字列あいうえお")).toBe("other");
  });

  it("要約テキストも分類に使用される", () => {
    expect(classifyTopic("速報", "日銀が緊急利上げを決定")).toBe("economy");
  });

  it("優先順位: 災害 > 天気 > スポーツ > 社会", () => {
    expect(classifyTopic("地震被害でプロ野球の試合が中止")).toBe("disaster");
  });
});

describe("getTopicDef", () => {
  it("既知カテゴリのラベルとアイコンを返す", () => {
    const def = getTopicDef("economy");
    expect(def.label).toBe("経済");
    expect(def.icon).toBe("📈");
  });

  it("science_tech のラベルを返す", () => {
    const def = getTopicDef("science_tech");
    expect(def.label).toBe("科学・技術");
  });

  it("other の場合は「その他」を返す", () => {
    const def = getTopicDef("other");
    expect(def.label).toBe("その他");
    expect(def.icon).toBe("📰");
  });
});

describe("TOPIC_ORDER", () => {
  it("11カテゴリすべてが定義されている", () => {
    expect(TOPIC_ORDER).toHaveLength(11);
    for (const id of TOPIC_ORDER) {
      expect(TOPICS[id]).toBeDefined();
    }
  });

  it("各カテゴリのキーワードは1件以上ある", () => {
    for (const id of TOPIC_ORDER) {
      expect(TOPICS[id].keywords.length).toBeGreaterThan(0);
    }
  });
});
