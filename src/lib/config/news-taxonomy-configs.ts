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
    description: "政権運営、国会、選挙、外交、防衛、地方自治",
    subcategories: [
      { id: "domestic_politics", label: "国内政局", description: "政権運営、党内政治、内閣改造" },
      { id: "election",          label: "選挙",     description: "国政選挙、地方選挙、選挙制度" },
      { id: "legislation",       label: "立法",     description: "国会審議、法案、条例" },
      { id: "diplomacy",         label: "外交",     description: "日本政府の外交活動、首脳会談、条約交渉" },
      { id: "security",          label: "安全保障", description: "防衛政策、自衛隊、軍事、同盟" },
      { id: "local_politics",    label: "地方自治", description: "地方議会、知事、市長、地域課題" },
    ],
  },
  {
    id: "economy",
    label: "経済",
    icon: "📈",
    description: "金融政策、株式市場、財政、物価、貿易、雇用、不動産",
    subcategories: [
      { id: "monetary_policy", label: "金融政策",   description: "日銀政策、金利、量的緩和" },
      { id: "stock_market",    label: "株式市場",   description: "日経平均、ダウ、株価指数、市況" },
      { id: "fiscal_policy",   label: "財政",       description: "予算、税制、社会保障財源" },
      { id: "prices",          label: "物価・消費",  description: "インフレ、デフレ、個人消費" },
      { id: "trade",           label: "貿易",       description: "輸出入、為替、国際経済" },
      { id: "labor",           label: "労働市場",   description: "雇用統計、賃金、最低賃金" },
      { id: "real_estate",     label: "不動産・住宅", description: "地価、住宅市場、都市開発" },
    ],
  },
  {
    id: "business",
    label: "ビジネス",
    icon: "💼",
    description: "企業動向、決算、M&A、スタートアップ、産業別ニュース",
    subcategories: [
      { id: "earnings",        label: "企業決算",      description: "業績発表、配当、上場企業の財務" },
      { id: "ma",              label: "M&A・再編",     description: "合併、買収、経営統合" },
      { id: "startup",         label: "スタートアップ",  description: "ベンチャー企業、起業、IPO" },
      { id: "hr",              label: "雇用・人事",    description: "採用、リストラ、役員人事" },
      { id: "auto_industry",   label: "自動車産業",    description: "自動車メーカー、部品、次世代モビリティ" },
      { id: "manufacturing",   label: "製造業・メーカー", description: "電機、素材、機械、工場動向" },
      { id: "retail_services", label: "小売・サービス",  description: "百貨店、コンビニ、飲食、サービス業" },
    ],
  },
  {
    id: "international",
    label: "国際・ワールド",
    icon: "🌍",
    description: "海外で起きた出来事、各地域の情勢、国際機関",
    subcategories: [
      { id: "us_news",           label: "北米",               description: "米国政治、社会、経済、カナダ" },
      { id: "asia_oceania",      label: "アジア・オセアニア",     description: "中国、韓国、台湾、東南アジア、豪州" },
      { id: "europe_news",       label: "欧州",               description: "EU、イギリス、フランス、ドイツ、ロシア" },
      { id: "middle_east",       label: "中東・アフリカ",        description: "中東情勢、アフリカ全域" },
      { id: "latin_america",     label: "中南米",              description: "ブラジル、メキシコ、アルゼンチン、中南米全域" },
      { id: "international_org", label: "国際機関",            description: "国連、WHO、NATO、国際紛争" },
    ],
  },
  {
    id: "society",
    label: "社会・事件",
    icon: "⚖️",
    description: "事件、事故、裁判、社会問題、地域ニュース",
    subcategories: [
      { id: "crime",           label: "事件・犯罪",     description: "殺人、強盗、詐欺、逮捕" },
      { id: "accident",        label: "事故・交通",     description: "交通事故、火災、鉄道トラブル" },
      { id: "justice",         label: "裁判・司法",     description: "訴訟、判決、法務、司法制度" },
      { id: "social_issues",   label: "社会問題",       description: "少子高齢化、ジェンダー、人権、格差" },
      { id: "imperial_royal",  label: "皇室",          description: "天皇・皇族の公務、儀式、皇位継承" },
      { id: "local_news",      label: "地域・ローカル",  description: "地域の話題、街ネタ、地方での出来事" },
    ],
  },
  {
    id: "health",
    label: "健康・医療",
    icon: "🏥",
    description: "医療、感染症、公衆衛生、メンタルヘルス",
    subcategories: [
      { id: "infectious_disease", label: "感染症",       description: "COVID-19、インフルエンザ、その他感染症" },
      { id: "healthcare_system",  label: "医療制度",     description: "健康保険、介護制度、医療政策" },
      { id: "pharma",             label: "創薬・治療",   description: "新薬承認、臨床試験、治療法開発" },
      { id: "public_health",      label: "公衆衛生",     description: "予防接種、健康寿命、公衆衛生施策" },
      { id: "mental_health",      label: "メンタルヘルス", description: "心の健康、ストレス、精神疾患" },
    ],
  },
  {
    id: "disaster",
    label: "災害",
    icon: "⚠️",
    description: "地震、台風、豪雨、原発事故などの自然・人為災害",
    subcategories: [
      { id: "earthquake",          label: "地震・津波",     description: "地震、余震、津波" },
      { id: "weather_disaster",    label: "気象災害",       description: "台風・豪雨・暴風による被害、浸水、停電、土砂災害" },
      { id: "industrial_accident", label: "原発・産業事故",   description: "原発事故、産業事故、化学事故" },
      { id: "disaster_prevention", label: "防災",          description: "防災対策、避難、警報" },
    ],
  },
  {
    id: "sports",
    label: "スポーツ",
    icon: "⚽",
    description: "野球、サッカー、オリンピックなどの競技スポーツ",
    subcategories: [
      { id: "baseball",             label: "プロ野球",         description: "NPB、日本シリーズ、国内選手動向" },
      { id: "mlb",                  label: "MLB・海外野球",    description: "メジャーリーグ、海外移籍、日本人選手" },
      { id: "soccer",               label: "サッカー",         description: "Jリーグ、W杯、海外リーグ、日本代表" },
      { id: "international_sports", label: "五輪・国際大会",     description: "オリンピック、パラリンピック、世界選手権" },
      { id: "martial_arts",         label: "格闘技・大相撲",     description: "大相撲、ボクシング、プロレス、総合格闘技" },
      { id: "other_sports",         label: "その他競技",       description: "テニス、バスケ、ゴルフ、陸上、モータースポーツなど" },
    ],
  },
  {
    id: "science_tech",
    label: "科学・技術",
    icon: "🔬",
    description: "AI、半導体、宇宙開発、エネルギー、最新テクノロジー",
    subcategories: [
      { id: "ai_semiconductor", label: "AI・半導体",         description: "生成AI、LLM、半導体、量子コンピュータ" },
      { id: "space",            label: "宇宙",               description: "宇宙開発、ロケット、惑星探査" },
      { id: "energy",           label: "エネルギー",         description: "再生可能エネルギー、原子力、電力・ガス" },
      { id: "environment",      label: "環境・気候変動",     description: "温暖化、生物多様性、公害、環境規制" },
      { id: "cyber",            label: "サイバーセキュリティ", description: "サイバー攻撃、情報漏洩、セキュリティ対策" },
      { id: "gadgets",          label: "IT・ガジェット",      description: "スマートフォン、PC、家電、ソフトウェア" },
      { id: "bio_tech",         label: "バイオ・ライフサイエンス", description: "バイオテクノロジー、遺伝子、生物学" },
    ],
  },
  {
    id: "weather",
    label: "天気",
    icon: "🌤️",
    description: "気象予報、気温、季節の話題",
    subcategories: [
      { id: "daily_weather", label: "気象概況",      description: "日々の天気予報、気温、降水量" },
      { id: "extreme_heat",  label: "猛暑・暑さ",    description: "夏日、真夏日、猛暑日、熱中症注意" },
      { id: "heavy_rain",    label: "大雨・豪雨",    description: "大雨予報、降水量、梅雨前線" },
      { id: "heavy_snow",    label: "大雪・寒波",    description: "降雪予報、積雪量、路面凍結注意" },
    ],
  },
  {
    id: "culture_lifestyle",
    label: "文化・ライフスタイル",
    icon: "🎭",
    description: "エンタメ、教育、食、旅行など生活に関わる話題",
    subcategories: [
      { id: "entertainment",  label: "エンタメ・芸能", description: "芸能ニュース、タレント、アイドル" },
      { id: "movies_music",   label: "映画・音楽",     description: "映画公開、音楽チャート、ライブ" },
      { id: "anime_manga",    label: "アニメ・漫画",   description: "アニメ放送、漫画の新刊、ゲーム" },
      { id: "education",      label: "教育",          description: "教育制度、受験、学習" },
      { id: "food",           label: "グルメ・食",      description: "新作スイーツ、レストラン、食文化" },
      { id: "travel",         label: "旅行・レジャー",  description: "観光地、交通、ホテル、アウトドア" },
      { id: "art_exhibition", label: "アート・芸術",   description: "展覧会、美術館、伝統文化" },
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
