package steps

import (
	"testing"

	"github.com/newsprism/shared/db"
)

func TestExtractCommonKeywords(t *testing.T) {
	articles := []db.Article{
		{Title: "トランプ大統領が関税引き上げを発表"},
		{Title: "トランプ関税に市場が反応、円安進む"},
		{Title: "関税問題でトランプ政権と中国が対立"},
	}
	keywords := extractCommonKeywords(articles)
	if keywords == nil {
		t.Skip("kagome tokenizer unavailable")
	}

	keywordSet := make(map[string]bool, len(keywords))
	for _, k := range keywords {
		keywordSet[k] = true
	}

	// 固有名詞「トランプ」と「関税」が含まれること
	for _, want := range []string{"トランプ", "関税"} {
		if !keywordSet[want] {
			t.Errorf("expected keyword %q in %v", want, keywords)
		}
	}

	// 断片が含まれないこと
	for _, bad := range []string{"トラン", "ランプ", "関税引", "税引"} {
		if keywordSet[bad] {
			t.Errorf("fragment %q should not be in keywords %v", bad, keywords)
		}
	}
}

func TestExtractCommonKeywords_Singleton(t *testing.T) {
	articles := []db.Article{
		{Title: "トランプ大統領が発表"},
	}
	if got := extractCommonKeywords(articles); got != nil {
		t.Errorf("expected nil for single article, got %v", got)
	}
}

func TestFallbackTitle_CommonKeywords(t *testing.T) {
	c := Cluster{
		Articles: []db.Article{
			{Title: "日銀が利上げを決定"},
			{Title: "日銀の利上げ決定に市場が反応"},
		},
	}
	title := fallbackTitle(c)
	if title == "" {
		t.Error("fallbackTitle returned empty string")
	}
	t.Logf("fallbackTitle: %q", title)
}
