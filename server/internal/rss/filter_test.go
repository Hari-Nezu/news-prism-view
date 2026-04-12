package rss

import (
	"testing"

	"github.com/mmcdole/gofeed"
)

func TestFilterByKeyword(t *testing.T) {
	items := []*gofeed.Item{
		{Title: "経済政策の行方", Description: "財政に関する話題"},
		{Title: "スポーツ速報", Description: "野球の試合結果"},
		{Title: "ABC News", Description: "abc ニュース"},
	}

	t.Run("空キーワードは全件返す", func(t *testing.T) {
		got := FilterByKeyword(items, "")
		if len(got) != len(items) {
			t.Fatalf("got %d, want %d", len(got), len(items))
		}
	})

	t.Run("タイトル一致", func(t *testing.T) {
		got := FilterByKeyword(items, "経済")
		if len(got) != 1 || got[0].Title != "経済政策の行方" {
			t.Fatalf("unexpected: %v", got)
		}
	})

	t.Run("Description一致", func(t *testing.T) {
		got := FilterByKeyword(items, "財政")
		if len(got) != 1 {
			t.Fatalf("got %d, want 1", len(got))
		}
	})

	t.Run("大文字小文字無視", func(t *testing.T) {
		got := FilterByKeyword(items, "ABC")
		if len(got) != 1 || got[0].Title != "ABC News" {
			t.Fatalf("unexpected: %v", got)
		}
	})

	t.Run("マッチなし", func(t *testing.T) {
		got := FilterByKeyword(items, "存在しないキーワード")
		if len(got) != 0 {
			t.Fatalf("got %d, want 0", len(got))
		}
	})

	t.Run("nilスライス", func(t *testing.T) {
		got := FilterByKeyword(nil, "経済")
		if got != nil {
			t.Fatalf("got %v, want nil", got)
		}
	})
}
