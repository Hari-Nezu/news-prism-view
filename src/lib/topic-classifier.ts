/** ニュース記事のトピック分類（キーワードマッチ） */

export interface TopicDef {
  label: string;
  icon: string;
  keywords: string[];
}

export const TOPICS: Record<string, TopicDef> = {
  disaster: {
    label: "災害",
    icon: "⚠️",
    keywords: [
      "地震", "台風", "津波", "洪水", "大雨", "豪雨", "避難", "被災",
      "震度", "マグニチュード", "火山", "噴火", "土砂崩れ", "停電",
      "熱中症", "大雪", "暴風", "警報", "注意報",
    ],
  },
  sports: {
    label: "スポーツ",
    icon: "⚽",
    keywords: [
      "野球", "サッカー", "オリンピック", "パラリンピック", "ラグビー", "テニス",
      "水泳", "陸上競技", "バスケットボール", "バレーボール", "ゴルフ", "相撲",
      "柔道", "剣道", "マラソン", "スキー", "スノーボード", "選手権大会",
    ],
  },
  diplomacy: {
    label: "外交・安保",
    icon: "🌐",
    keywords: [
      "外交", "外務省", "防衛省", "安全保障", "自衛隊", "米軍", "日米", "日中", "日韓",
      "北朝鮮", "ミサイル", "核", "条約", "制裁", "G7", "G20", "国連", "NATO",
      "ロシア", "ウクライナ", "台湾有事", "中東", "大統領", "首脳会談", "外相会談",
      "防衛費", "軍事", "安保",
    ],
  },
  politics: {
    label: "政治",
    icon: "🏛️",
    keywords: [
      "首相", "大臣", "国会", "議員", "与党", "野党", "自民党", "立憲民主",
      "公明党", "維新", "共産党", "参政党", "選挙", "投票", "政策",
      "法案", "閣議", "内閣", "官房長官", "行政", "省庁", "条例", "規制改革",
    ],
  },
  economy: {
    label: "経済",
    icon: "💰",
    keywords: [
      "株価", "円安", "円高", "日銀", "金利", "利上げ", "利下げ", "GDP",
      "景気", "物価", "インフレ", "デフレ", "増税", "減税", "財政", "予算",
      "補正予算", "税制", "金融政策", "企業業績", "決算", "上場",
      "賃上げ", "最低賃金", "輸出", "輸入", "貿易赤字", "経済成長",
    ],
  },
  tech: {
    label: "テック",
    icon: "💻",
    keywords: [
      "人工知能", "生成AI", "ChatGPT", "半導体", "スタートアップ", "デジタル",
      "サイバー攻撃", "宇宙開発", "ロケット", "電気自動車", "EV", "再生可能エネルギー",
      "脱炭素", "カーボンニュートラル", "データセンター", "クラウド", "量子コンピュータ",
      "SNS", "プラットフォーム規制",
    ],
  },
  society: {
    label: "社会",
    icon: "🏘️",
    keywords: [
      "少子化", "高齢化", "人口減少", "教育", "医療", "年金", "介護", "子育て",
      "保育", "福祉", "貧困", "格差", "労働問題", "働き方改革", "外国人労働者",
      "ジェンダー", "LGBT", "差別", "人権", "殺人", "強盗", "詐欺", "逮捕", "裁判",
    ],
  },
};

// 優先度順（先にマッチしたものが採用される）
export const TOPIC_ORDER: string[] = [
  "disaster",
  "sports",
  "diplomacy",
  "politics",
  "economy",
  "tech",
  "society",
];

export type TopicId = keyof typeof TOPICS | "other";

export const OTHER_TOPIC: TopicDef = {
  label: "その他",
  icon: "📰",
  keywords: [],
};

/** タイトルと要約からトピックIDを返す（キーワードマッチ） */
export function classifyTopic(title: string, summary?: string): TopicId {
  const text = `${title} ${summary ?? ""}`;
  for (const id of TOPIC_ORDER) {
    const topic = TOPICS[id];
    if (topic.keywords.some((kw) => text.includes(kw))) {
      return id as TopicId;
    }
  }
  return "other";
}

/** TopicId からラベル・アイコンを取得する */
export function getTopicDef(id: TopicId): TopicDef {
  return TOPICS[id] ?? OTHER_TOPIC;
}
