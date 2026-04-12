import type { NewsGroup } from "@/types";

export const MEDIA = [
  { short: "N",    label: "NHK",               match: (s: string) => s.startsWith("NHK") },
  { short: "朝",   label: "朝日新聞",           match: (s: string) => s.startsWith("朝日") },
  { short: "毎",   label: "毎日新聞",           match: (s: string) => s.startsWith("毎日") },
  { short: "読",   label: "読売新聞",           match: (s: string) => s.startsWith("読売") },
  { short: "経",   label: "日本経済新聞",       match: (s: string) => s.startsWith("日経") || s === "日本経済新聞" },
  { short: "産",   label: "産経新聞",           match: (s: string) => s.startsWith("産経") },
  { short: "東",   label: "東京新聞",           match: (s: string) => s === "東京新聞" },
  { short: "時",   label: "時事通信",           match: (s: string) => s === "時事通信" },
  { short: "共",   label: "共同通信",           match: (s: string) => s === "共同通信" },
  { short: "T",    label: "TBSニュース",        match: (s: string) => s.startsWith("TBS") },
  { short: "テレ", label: "テレビ朝日",         match: (s: string) => s === "テレビ朝日" },
  { short: "フジ", label: "フジテレビ",         match: (s: string) => s === "フジテレビ" },
  { short: "NTV",  label: "日本テレビ",         match: (s: string) => s === "日本テレビ" },
  { short: "洋",   label: "東洋経済オンライン", match: (s: string) => s.includes("東洋経済") },
  { short: "ハ",   label: "ハフポスト日本版",   match: (s: string) => s.startsWith("ハフ") },
] as const;

export type MediaEntry = (typeof MEDIA)[number];

export function countArticles(group: NewsGroup, media: MediaEntry): number {
  return (group.items ?? []).filter((item) => media.match(item.source)).length;
}
