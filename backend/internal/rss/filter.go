package rss

import "strings"

var politicalKeywords = []string{
	"政府", "首相", "大臣", "国会", "議員", "与党", "野党", "自民党", "立憲", "公明党",
	"維新", "共産党", "選挙", "投票", "政策", "法案", "閣議", "内閣", "官房長官",
	"外交", "外務省", "防衛", "安全保障", "自衛隊", "米軍", "日米", "日中", "日韓",
	"北朝鮮", "ミサイル", "核", "条約", "制裁", "G7", "G20", "国連", "NATO",
	"中国", "ロシア", "ウクライナ", "台湾", "韓国", "アメリカ", "米国", "欧州",
	"財政", "税制", "増税", "減税", "予算", "補正予算", "GDP", "景気", "物価",
	"インフレ", "金利", "日銀", "金融政策", "規制", "改革",
}

var excludeKeywords = []string{
	"野球", "サッカー", "オリンピック", "芸能", "俳優", "タレント", "映画",
	"天気", "地震", "台風", "交通事故",
}

// IsPolitical returns true if the text matches political/economic keywords.
func IsPolitical(title, summary string) bool {
	text := title + " " + summary
	for _, kw := range excludeKeywords {
		if strings.Contains(text, kw) {
			return false
		}
	}
	for _, kw := range politicalKeywords {
		if strings.Contains(text, kw) {
			return true
		}
	}
	return false
}
