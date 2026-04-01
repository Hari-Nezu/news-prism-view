/**
 * ニュース分類体系 — Category / Subcategory 定義
 * Topic（動的）はDBで管理する（Phase 2 以降）
 */

export interface SubcategoryDef {
  id: string;
  label: string;
  description: string;
}

export interface CategoryDef {
  id: string;
  label: string;
  icon: string;
  description: string;
  subcategories: SubcategoryDef[];
}

export const CATEGORIES: CategoryDef[] = [
  {
    id: "politics",
    label: "政治",
    icon: "🏛️",
    description: "政権運営、国会、選挙、外交、防衛、安全保障",
    subcategories: [
      { id: "domestic_politics", label: "国内政局", description: "政権運営、党内政治、内閣改造" },
      { id: "election",          label: "選挙",     description: "国政選挙、地方選挙、選挙制度" },
      { id: "legislation",       label: "立法",     description: "国会審議、法案、条例" },
      { id: "diplomacy",         label: "外交",     description: "国家間の交渉、条約、首脳会談、国際会議" },
      { id: "security",          label: "安全保障", description: "防衛政策、自衛隊、軍事、同盟" },
    ],
  },
  {
    id: "economy",
    label: "経済",
    icon: "📈",
    description: "金融政策、財政、物価、貿易、雇用などマクロ経済",
    subcategories: [
      { id: "monetary_policy", label: "金融政策",  description: "日銀政策、金利、量的緩和" },
      { id: "fiscal_policy",   label: "財政",      description: "予算、税制、社会保障財源" },
      { id: "prices",          label: "物価・消費", description: "インフレ、デフレ、個人消費" },
      { id: "trade",           label: "貿易",      description: "輸出入、為替、国際経済" },
      { id: "labor",           label: "労働市場",  description: "雇用統計、賃金、最低賃金" },
    ],
  },
  {
    id: "business",
    label: "ビジネス",
    icon: "💼",
    description: "個別企業の決算、M&A、スタートアップなど企業動向",
    subcategories: [
      { id: "earnings", label: "企業決算",      description: "業績発表、配当、上場企業の財務" },
      { id: "ma",       label: "M&A・再編",     description: "合併、買収、経営統合" },
      { id: "startup",  label: "スタートアップ", description: "ベンチャー企業、起業、IPO" },
      { id: "hr",       label: "雇用・人事",    description: "採用、リストラ、役員人事" },
    ],
  },
  {
    id: "health",
    label: "健康",
    icon: "🏥",
    description: "医療、感染症、公衆衛生、医療制度",
    subcategories: [
      { id: "infectious_disease",  label: "感染症",   description: "COVID-19、インフルエンザ、その他感染症" },
      { id: "healthcare_system",   label: "医療制度", description: "健康保険、介護制度、医療政策" },
      { id: "pharma",              label: "創薬・治療", description: "新薬承認、臨床試験、治療法開発" },
      { id: "public_health",       label: "公衆衛生", description: "予防接種、健康寿命、公衆衛生施策" },
    ],
  },
  {
    id: "disaster",
    label: "災害",
    icon: "⚠️",
    description: "地震、台風、豪雨、原発事故などの自然・人為災害",
    subcategories: [
      { id: "earthquake",           label: "地震・津波",   description: "地震、余震、津波" },
      { id: "weather_disaster",     label: "気象災害",     description: "台風、豪雨、大雪、暴風" },
      { id: "industrial_accident",  label: "原発・産業事故", description: "原発事故、産業事故、化学事故" },
      { id: "disaster_prevention",  label: "防災",         description: "防災対策、避難、警報" },
    ],
  },
  {
    id: "sports",
    label: "スポーツ",
    icon: "⚽",
    description: "野球、サッカー、オリンピックなどの競技スポーツ",
    subcategories: [
      { id: "baseball",             label: "プロ野球",      description: "NPB、日本シリーズ、選手動向" },
      { id: "soccer",               label: "サッカー",      description: "Jリーグ、W杯、ACL" },
      { id: "international_sports", label: "五輪・国際大会", description: "オリンピック、パラリンピック、世界選手権" },
      { id: "other_sports",         label: "その他競技",    description: "テニス、バスケ、相撲、格闘技など" },
    ],
  },
  {
    id: "science_tech",
    label: "科学・技術",
    icon: "🔬",
    description: "AI、半導体、宇宙開発、エネルギー、サイバーセキュリティ",
    subcategories: [
      { id: "ai_semiconductor", label: "AI・半導体",         description: "生成AI、LLM、半導体、量子コンピュータ" },
      { id: "space",            label: "宇宙",               description: "宇宙開発、ロケット、惑星探査" },
      { id: "energy",           label: "エネルギー",         description: "再生可能エネルギー、脱炭素、EV" },
      { id: "cyber",            label: "サイバーセキュリティ", description: "サイバー攻撃、情報漏洩、セキュリティ対策" },
    ],
  },
  {
    id: "culture_lifestyle",
    label: "文化・ライフスタイル",
    icon: "🎭",
    description: "エンタメ、教育、社会問題、事件・司法",
    subcategories: [
      { id: "entertainment", label: "エンタメ",   description: "映画、音楽、ドラマ、アニメ、芸能" },
      { id: "education",     label: "教育",       description: "教育制度、受験、学習" },
      { id: "social_issues", label: "社会問題",   description: "少子化、高齢化、ジェンダー、人権、格差" },
      { id: "crime_justice", label: "事件・司法", description: "殺人、詐欺、裁判、法務" },
    ],
  },
];

export const CATEGORY_MAP = new Map(CATEGORIES.map((c) => [c.id, c]));

/** LLMプロンプト用の分類基準テキストを生成 */
export function buildClassificationGuide(): string {
  return CATEGORIES.map((cat) => {
    const subcats = cat.subcategories
      .map((s) => `  - ${s.label}（${s.id}）: ${s.description}`)
      .join("\n");
    return `## ${cat.label}（${cat.id}）\n${subcats}`;
  }).join("\n\n");
}
