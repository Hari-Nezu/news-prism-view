import { describe, it, expect } from "vitest";
import { getSourceColors, getChartColor } from "./source-colors";

describe("getSourceColors", () => {
  it("主要媒体は固定カラーを返す", () => {
    const c = getSourceColors("NHK政治");
    expect(c.dotColor).toBe("#ef4444");
    expect(c.textColor).toBe("#dc2626");
  });

  it("前方一致で NHK 系を認識する", () => {
    const known = getSourceColors("NHK政治");
    const prefix = getSourceColors("NHKニュース");  // 未登録だが NHK 前方一致
    expect(prefix.dotColor).toBe(known.dotColor);
  });

  it("未知ソースでもオブジェクトを返す（フォールバック）", () => {
    const c = getSourceColors("謎のニュースサイト");
    expect(c).toHaveProperty("bgColor");
    expect(c).toHaveProperty("textColor");
    expect(c).toHaveProperty("dotColor");
    expect(c).toHaveProperty("borderColor");
  });

  it("未知ソースのカラーは hsl 形式", () => {
    const c = getSourceColors("謎のニュースサイト");
    expect(c.bgColor).toMatch(/^hsl\(/);
  });

  it("同じ名前は同じカラーを返す（決定論的ハッシュ）", () => {
    const a = getSourceColors("ランダム媒体X");
    const b = getSourceColors("ランダム媒体X");
    expect(a).toEqual(b);
  });

  it("異なる名前は異なるカラーを返す", () => {
    const a = getSourceColors("媒体AAA");
    const b = getSourceColors("媒体BBB");
    expect(a.dotColor).not.toBe(b.dotColor);
  });
});

describe("getChartColor", () => {
  const sources = ["NHK", "朝日新聞", "産経新聞"];

  it("既知ソースのインデックスから色を返す", () => {
    const color = getChartColor("NHK", sources);
    expect(color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("ソースリストにない場合もハッシュで色を返す", () => {
    const color = getChartColor("未知媒体", sources);
    expect(color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("同一ソースは同一色を返す", () => {
    const a = getChartColor("NHK", sources);
    const b = getChartColor("NHK", sources);
    expect(a).toBe(b);
  });
});
