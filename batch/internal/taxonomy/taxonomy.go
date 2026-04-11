// Package taxonomy defines the canonical news category/subcategory taxonomy.
// This mirrors src/lib/config/news-taxonomy-configs.ts exactly.
package taxonomy

import "fmt"

type Subcategory struct {
	ID          string
	Label       string
	Description string
}

type Category struct {
	ID            string
	Label         string
	Description   string
	Subcategories []Subcategory
}

var Categories = []Category{
	{
		ID:          "politics",
		Label:       "政治",
		Description: "政権運営、国会、選挙、外交、防衛、地方自治",
		Subcategories: []Subcategory{
			{ID: "domestic_politics", Label: "国内政局", Description: "政権運営、党内政治、内閣改造"},
			{ID: "election", Label: "選挙", Description: "国政選挙、地方選挙、選挙制度"},
			{ID: "legislation", Label: "立法", Description: "国会審議、法案、条例"},
			{ID: "diplomacy", Label: "外交", Description: "日本政府の外交活動、首脳会談、条約交渉"},
			{ID: "security", Label: "安全保障", Description: "防衛政策、自衛隊、軍事、同盟"},
			{ID: "local_politics", Label: "地方自治", Description: "地方議会、知事、市長、地域課題"},
		},
	},
	{
		ID:          "economy",
		Label:       "経済",
		Description: "金融政策、株式市場、財政、物価、貿易、雇用、不動産",
		Subcategories: []Subcategory{
			{ID: "monetary_policy", Label: "金融政策", Description: "日銀政策、金利、量的緩和"},
			{ID: "stock_market", Label: "株式市場", Description: "日経平均、ダウ、株価指数、市況"},
			{ID: "fiscal_policy", Label: "財政", Description: "予算、税制、社会保障財源"},
			{ID: "prices", Label: "物価・消費", Description: "インフレ、デフレ、個人消費"},
			{ID: "trade", Label: "貿易", Description: "輸出入、為替、国際経済"},
			{ID: "labor", Label: "労働市場", Description: "雇用統計、賃金、最低賃金"},
			{ID: "real_estate", Label: "不動産・住宅", Description: "地価、住宅市場、都市開発"},
		},
	},
	{
		ID:          "business",
		Label:       "ビジネス",
		Description: "企業動向、決算、M&A、スタートアップ、産業別ニュース",
		Subcategories: []Subcategory{
			{ID: "earnings", Label: "企業決算", Description: "業績発表、配当、上場企業の財務"},
			{ID: "ma", Label: "M&A・再編", Description: "合併、買収、経営統合"},
			{ID: "startup", Label: "スタートアップ", Description: "ベンチャー企業、起業、IPO"},
			{ID: "hr", Label: "雇用・人事", Description: "採用、リストラ、役員人事"},
			{ID: "auto_industry", Label: "自動車産業", Description: "自動車メーカー、部品、次世代モビリティ"},
			{ID: "manufacturing", Label: "製造業・メーカー", Description: "電機、素材、機械、工場動向"},
			{ID: "retail_services", Label: "小売・サービス", Description: "百貨店、コンビニ、飲食、サービス業"},
		},
	},
	{
		ID:          "international",
		Label:       "国際・ワールド",
		Description: "海外で起きた出来事、各地域の情勢、国際機関",
		Subcategories: []Subcategory{
			{ID: "us_news", Label: "北米", Description: "米国政治、社会、経済、カナダ"},
			{ID: "asia_oceania", Label: "アジア・オセアニア", Description: "中国、韓国、台湾、東南アジア、豪州"},
			{ID: "europe_news", Label: "欧州", Description: "EU、イギリス、フランス、ドイツ、ロシア"},
			{ID: "middle_east", Label: "中東・アフリカ", Description: "中東情勢、アフリカ全域"},
			{ID: "latin_america", Label: "中南米", Description: "ブラジル、メキシコ、アルゼンチン、中南米全域"},
			{ID: "international_org", Label: "国際機関", Description: "国連、WHO、NATO、国際紛争"},
		},
	},
	{
		ID:          "society",
		Label:       "社会・事件",
		Description: "事件、事故、裁判、社会問題、地域ニュース",
		Subcategories: []Subcategory{
			{ID: "crime", Label: "事件・犯罪", Description: "殺人、強盗、詐欺、逮捕"},
			{ID: "accident", Label: "事故・交通", Description: "交通事故、火災、鉄道トラブル"},
			{ID: "justice", Label: "裁判・司法", Description: "訴訟、判決、法務、司法制度"},
			{ID: "social_issues", Label: "社会問題", Description: "少子高齢化、ジェンダー、人権、格差"},
			{ID: "imperial_royal", Label: "皇室", Description: "天皇・皇族の公務、儀式、皇位継承"},
			{ID: "local_news", Label: "地域・ローカル", Description: "地域の話題、街ネタ、地方での出来事"},
		},
	},
	{
		ID:          "health",
		Label:       "健康・医療",
		Description: "医療、感染症、公衆衛生、メンタルヘルス",
		Subcategories: []Subcategory{
			{ID: "infectious_disease", Label: "感染症", Description: "COVID-19、インフルエンザ、その他感染症"},
			{ID: "healthcare_system", Label: "医療制度", Description: "健康保険、介護制度、医療政策"},
			{ID: "pharma", Label: "創薬・治療", Description: "新薬承認、臨床試験、治療法開発"},
			{ID: "public_health", Label: "公衆衛生", Description: "予防接種、健康寿命、公衆衛生施策"},
			{ID: "mental_health", Label: "メンタルヘルス", Description: "心の健康、ストレス、精神疾患"},
		},
	},
	{
		ID:          "disaster",
		Label:       "災害",
		Description: "地震、台風、豪雨、原発事故などの自然・人為災害",
		Subcategories: []Subcategory{
			{ID: "earthquake", Label: "地震・津波", Description: "地震、余震、津波"},
			{ID: "weather_disaster", Label: "気象災害", Description: "台風・豪雨・暴風による被害、浸水、停電、土砂災害"},
			{ID: "industrial_accident", Label: "原発・産業事故", Description: "原発事故、産業事故、化学事故"},
			{ID: "disaster_prevention", Label: "防災", Description: "防災対策、避難、警報"},
		},
	},
	{
		ID:          "sports",
		Label:       "スポーツ",
		Description: "野球、サッカー、オリンピックなどの競技スポーツ",
		Subcategories: []Subcategory{
			{ID: "baseball", Label: "プロ野球", Description: "NPB、日本シリーズ、国内選手動向"},
			{ID: "mlb", Label: "MLB・海外野球", Description: "メジャーリーグ、海外移籍、日本人選手"},
			{ID: "soccer", Label: "サッカー", Description: "Jリーグ、W杯、海外リーグ、日本代表"},
			{ID: "international_sports", Label: "五輪・国際大会", Description: "オリンピック、パラリンピック、世界選手権"},
			{ID: "martial_arts", Label: "格闘技・大相撲", Description: "大相撲、ボクシング、プロレス、総合格闘技"},
			{ID: "other_sports", Label: "その他競技", Description: "テニス、バスケ、ゴルフ、陸上、モータースポーツなど"},
		},
	},
	{
		ID:          "science_tech",
		Label:       "科学・技術",
		Description: "AI、半導体、宇宙開発、エネルギー、最新テクノロジー",
		Subcategories: []Subcategory{
			{ID: "ai_semiconductor", Label: "AI・半導体", Description: "生成AI、LLM、半導体、量子コンピュータ"},
			{ID: "space", Label: "宇宙", Description: "宇宙開発、ロケット、惑星探査"},
			{ID: "energy", Label: "エネルギー", Description: "再生可能エネルギー、原子力、電力・ガス"},
			{ID: "environment", Label: "環境・気候変動", Description: "温暖化、生物多様性、公害、環境規制"},
			{ID: "cyber", Label: "サイバーセキュリティ", Description: "サイバー攻撃、情報漏洩、セキュリティ対策"},
			{ID: "gadgets", Label: "IT・ガジェット", Description: "スマートフォン、PC、家電、ソフトウェア"},
			{ID: "bio_tech", Label: "バイオ・ライフサイエンス", Description: "バイオテクノロジー、遺伝子、生物学"},
		},
	},
	{
		ID:          "weather",
		Label:       "天気",
		Description: "気象予報、気温、季節の話題",
		Subcategories: []Subcategory{
			{ID: "daily_weather", Label: "気象概況", Description: "日々の天気予報、気温、降水量"},
			{ID: "extreme_heat", Label: "猛暑・暑さ", Description: "夏日、真夏日、猛暑日、熱中症注意"},
			{ID: "heavy_rain", Label: "大雨・豪雨", Description: "大雨予報、降水量、梅雨前線"},
			{ID: "heavy_snow", Label: "大雪・寒波", Description: "降雪予報、積雪量、路面凍結注意"},
		},
	},
	{
		ID:          "culture_lifestyle",
		Label:       "文化・ライフスタイル",
		Description: "エンタメ、教育、食、旅行など生活に関わる話題",
		Subcategories: []Subcategory{
			{ID: "entertainment", Label: "エンタメ・芸能", Description: "芸能ニュース、タレント、アイドル"},
			{ID: "movies_music", Label: "映画・音楽", Description: "映画公開、音楽チャート、ライブ"},
			{ID: "anime_manga", Label: "アニメ・漫画", Description: "アニメ放送、漫画の新刊、ゲーム"},
			{ID: "education", Label: "教育", Description: "教育制度、受験、学習"},
			{ID: "food", Label: "グルメ・食", Description: "新作スイーツ、レストラン、食文化"},
			{ID: "travel", Label: "旅行・レジャー", Description: "観光地、交通、ホテル、アウトドア"},
			{ID: "art_exhibition", Label: "アート・芸術", Description: "展覧会、美術館、伝統文化"},
		},
	},
}

type SubcategoryRef struct {
	CategoryID    string
	SubcategoryID string
	Text          string
}

// AllSubcategoryTexts returns flattened (categoryID, subcategoryID, text) tuples
// for use as reference embeddings. Text = "{cat.Label} {sub.Label}: {sub.Description}".
func AllSubcategoryTexts() []SubcategoryRef {
	refs := make([]SubcategoryRef, 0, 33)
	for _, cat := range Categories {
		for _, sub := range cat.Subcategories {
			refs = append(refs, SubcategoryRef{
				CategoryID:    cat.ID,
				SubcategoryID: sub.ID,
				Text:          fmt.Sprintf("%s %s: %s", cat.Label, sub.Label, sub.Description),
			})
		}
	}
	return refs
}

// BuildClassificationGuide returns a system prompt section listing all categories
// and subcategories for LLM classification.
func BuildClassificationGuide() string {
	guide := ""
	for _, cat := range Categories {
		guide += fmt.Sprintf("## %s（%s）\n", cat.Label, cat.ID)
		for _, sub := range cat.Subcategories {
			guide += fmt.Sprintf("  - %s（%s）: %s\n", sub.Label, sub.ID, sub.Description)
		}
		guide += "\n"
	}
	return guide
}

// ValidCategoryIDs returns a set of valid category ID strings.
func ValidCategoryIDs() map[string]bool {
	m := make(map[string]bool, len(Categories))
	for _, cat := range Categories {
		m[cat.ID] = true
	}
	return m
}

// ValidSubcategoryID reports whether subcategoryID belongs to categoryID.
func ValidSubcategoryID(categoryID, subcategoryID string) bool {
	for _, cat := range Categories {
		if cat.ID != categoryID {
			continue
		}
		for _, sub := range cat.Subcategories {
			if sub.ID == subcategoryID {
				return true
			}
		}
		return false
	}
	return false
}

// FirstSubcategoryID returns the first subcategory ID for a category, or "".
func FirstSubcategoryID(categoryID string) string {
	for _, cat := range Categories {
		if cat.ID == categoryID && len(cat.Subcategories) > 0 {
			return cat.Subcategories[0].ID
		}
	}
	return ""
}
