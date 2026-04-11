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
		Description: "政権運営、国会、選挙、外交、防衛、安全保障",
		Subcategories: []Subcategory{
			{ID: "domestic_politics", Label: "国内政局", Description: "政権運営、党内政治、内閣改造"},
			{ID: "election", Label: "選挙", Description: "国政選挙、地方選挙、選挙制度"},
			{ID: "legislation", Label: "立法", Description: "国会審議、法案、条例"},
			{ID: "diplomacy", Label: "外交", Description: "国家間の交渉、条約、首脳会談、国際会議"},
			{ID: "security", Label: "安全保障", Description: "防衛政策、自衛隊、軍事、同盟"},
		},
	},
	{
		ID:          "economy",
		Label:       "経済",
		Description: "金融政策、財政、物価、貿易、雇用などマクロ経済",
		Subcategories: []Subcategory{
			{ID: "monetary_policy", Label: "金融政策", Description: "日銀政策、金利、量的緩和"},
			{ID: "fiscal_policy", Label: "財政", Description: "予算、税制、社会保障財源"},
			{ID: "prices", Label: "物価・消費", Description: "インフレ、デフレ、個人消費"},
			{ID: "trade", Label: "貿易", Description: "輸出入、為替、国際経済"},
			{ID: "labor", Label: "労働市場", Description: "雇用統計、賃金、最低賃金"},
		},
	},
	{
		ID:          "business",
		Label:       "ビジネス",
		Description: "個別企業の決算、M&A、スタートアップなど企業動向",
		Subcategories: []Subcategory{
			{ID: "earnings", Label: "企業決算", Description: "業績発表、配当、上場企業の財務"},
			{ID: "ma", Label: "M&A・再編", Description: "合併、買収、経営統合"},
			{ID: "startup", Label: "スタートアップ", Description: "ベンチャー企業、起業、IPO"},
			{ID: "hr", Label: "雇用・人事", Description: "採用、リストラ、役員人事"},
		},
	},
	{
		ID:          "health",
		Label:       "健康",
		Description: "医療、感染症、公衆衛生、医療制度",
		Subcategories: []Subcategory{
			{ID: "infectious_disease", Label: "感染症", Description: "COVID-19、インフルエンザ、その他感染症"},
			{ID: "healthcare_system", Label: "医療制度", Description: "健康保険、介護制度、医療政策"},
			{ID: "pharma", Label: "創薬・治療", Description: "新薬承認、臨床試験、治療法開発"},
			{ID: "public_health", Label: "公衆衛生", Description: "予防接種、健康寿命、公衆衛生施策"},
		},
	},
	{
		ID:          "disaster",
		Label:       "災害",
		Description: "地震、台風、豪雨、原発事故などの自然・人為災害",
		Subcategories: []Subcategory{
			{ID: "earthquake", Label: "地震・津波", Description: "地震、余震、津波"},
			{ID: "weather_disaster", Label: "気象災害", Description: "台風、豪雨、大雪、暴風"},
			{ID: "industrial_accident", Label: "原発・産業事故", Description: "原発事故、産業事故、化学事故"},
			{ID: "disaster_prevention", Label: "防災", Description: "防災対策、避難、警報"},
		},
	},
	{
		ID:          "sports",
		Label:       "スポーツ",
		Description: "野球、サッカー、オリンピックなどの競技スポーツ",
		Subcategories: []Subcategory{
			{ID: "baseball", Label: "プロ野球", Description: "NPB、日本シリーズ、選手動向"},
			{ID: "soccer", Label: "サッカー", Description: "Jリーグ、W杯、ACL"},
			{ID: "international_sports", Label: "五輪・国際大会", Description: "オリンピック、パラリンピック、世界選手権"},
			{ID: "other_sports", Label: "その他競技", Description: "テニス、バスケ、相撲、格闘技など"},
		},
	},
	{
		ID:          "science_tech",
		Label:       "科学・技術",
		Description: "AI、半導体、宇宙開発、エネルギー、サイバーセキュリティ",
		Subcategories: []Subcategory{
			{ID: "ai_semiconductor", Label: "AI・半導体", Description: "生成AI、LLM、半導体、量子コンピュータ"},
			{ID: "space", Label: "宇宙", Description: "宇宙開発、ロケット、惑星探査"},
			{ID: "energy", Label: "エネルギー", Description: "再生可能エネルギー、脱炭素、EV"},
			{ID: "cyber", Label: "サイバーセキュリティ", Description: "サイバー攻撃、情報漏洩、セキュリティ対策"},
		},
	},
	{
		ID:          "weather",
		Label:       "天気",
		Description: "気象状況、気温、警報・注意報、季節の話題",
		Subcategories: []Subcategory{
			{ID: "daily_weather", Label: "気象概況", Description: "日々の天気、気温、降水量"},
			{ID: "extreme_heat", Label: "猛暑・暑さ", Description: "夏日、真夏日、猛暑日、熱中症対策"},
			{ID: "heavy_rain", Label: "大雨・豪雨", Description: "大雨、土砂災害、浸水"},
			{ID: "heavy_snow", Label: "大雪・寒波", Description: "積雪、路面凍結、降雪"},
		},
	},
	{
		ID:          "culture_lifestyle",
		Label:       "文化・ライフスタイル",
		Description: "エンタメ、教育、社会問題、事件・司法",
		Subcategories: []Subcategory{
			{ID: "entertainment", Label: "エンタメ", Description: "映画、音楽、ドラマ、アニメ、芸能"},
			{ID: "education", Label: "教育", Description: "教育制度、受験、学習"},
			{ID: "social_issues", Label: "社会問題", Description: "少子化、高齢化、ジェンダー、人権、格差"},
			{ID: "crime_justice", Label: "事件・司法", Description: "殺人、詐欺、裁判、法務"},
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
