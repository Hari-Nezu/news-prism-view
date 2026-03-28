import { describe, it, expect } from "vitest";
import { classifyTopic, getTopicDef, TOPICS, TOPIC_ORDER } from "./topic-classifier";

describe("classifyTopic", () => {
  it("災害キーワードで disaster を返す", () => {
    expect(classifyTopic("能登半島で震度6強の地震 住民が避難")).toBe("disaster");
    expect(classifyTopic("台風10号が接近、大雨警報")).toBe("disaster");
  });

  it("スポーツキーワードで sports を返す", () => {
    expect(classifyTopic("侍ジャパン、野球ワールドカップで優勝")).toBe("sports");
    expect(classifyTopic("オリンピック代表選考レース")).toBe("sports");
  });

  it("外交キーワードで diplomacy を返す", () => {
    expect(classifyTopic("日米首脳会談、防衛費増額で合意")).toBe("diplomacy");
    expect(classifyTopic("北朝鮮がミサイル発射、日本海に落下")).toBe("diplomacy");
    expect(classifyTopic("ロシアによるウクライナ侵攻が継続")).toBe("diplomacy");
  });

  it("政治キーワードで politics を返す", () => {
    expect(classifyTopic("国会で法案が可決、首相が署名")).toBe("politics");
    expect(classifyTopic("自民党、選挙公約を発表")).toBe("politics");
  });

  it("経済キーワードで economy を返す", () => {
    expect(classifyTopic("日銀が金利0.5%に引き上げ")).toBe("economy");
    expect(classifyTopic("株価が急落、円安加速")).toBe("economy");
    expect(classifyTopic("賃上げ率が過去最高水準に")).toBe("economy");
  });

  it("テックキーワードで tech を返す", () => {
    expect(classifyTopic("生成AIの規制を巡る議論が加速")).toBe("tech");
    expect(classifyTopic("国産半導体工場が稼働開始")).toBe("tech");
  });

  it("社会キーワードで society を返す", () => {
    expect(classifyTopic("少子化対策の強化を検討")).toBe("society");
    expect(classifyTopic("殺人事件で容疑者を逮捕")).toBe("society");
  });

  it("キーワード未一致で other を返す", () => {
    expect(classifyTopic("本日の天気は晴れのち曇り")).toBe("other");
    expect(classifyTopic("新しいレストランがオープン")).toBe("other");
  });

  it("要約テキストも分類に使用される", () => {
    // タイトルにキーワードなし、要約にあり
    expect(classifyTopic("速報", "日銀が緊急利上げを決定")).toBe("economy");
  });

  it("優先順位: 災害 > スポーツ > 外交 > 政治 > 経済", () => {
    // 地震（disaster）+ 経済（economy）→ disaster が勝つ
    expect(classifyTopic("地震被害で株価急落、経済への影響懸念")).toBe("disaster");
  });
});

describe("getTopicDef", () => {
  it("既知トピックのラベルとアイコンを返す", () => {
    const def = getTopicDef("economy");
    expect(def.label).toBe("経済");
    expect(def.icon).toBe("💰");
  });

  it("other の場合は「その他」を返す", () => {
    const def = getTopicDef("other");
    expect(def.label).toBe("その他");
    expect(def.icon).toBe("📰");
  });
});

describe("TOPIC_ORDER", () => {
  it("すべてのトピックが TOPICS に定義されている", () => {
    for (const id of TOPIC_ORDER) {
      expect(TOPICS[id]).toBeDefined();
    }
  });

  it("各トピックのキーワードは1件以上ある", () => {
    for (const id of TOPIC_ORDER) {
      expect(TOPICS[id].keywords.length).toBeGreaterThan(0);
    }
  });
});
