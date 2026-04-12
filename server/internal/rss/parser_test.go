package rss

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadFeeds(t *testing.T) {
	t.Run("正常YAML", func(t *testing.T) {
		content := `
feeds:
  - id: nhk
    name: NHK
    url: https://example.com/nhk.rss
  - id: asahi
    name: 朝日新聞
    url: https://example.com/asahi.rss
`
		f := writeTempFile(t, content)
		feeds, err := LoadFeeds(f)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(feeds) != 2 {
			t.Fatalf("got %d feeds, want 2", len(feeds))
		}
		if feeds[0].ID != "nhk" || feeds[0].Name != "NHK" {
			t.Errorf("unexpected feed[0]: %+v", feeds[0])
		}
	})

	t.Run("不正YAML", func(t *testing.T) {
		f := writeTempFile(t, "feeds: [broken: :")
		_, err := LoadFeeds(f)
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})

	t.Run("存在しないパス", func(t *testing.T) {
		_, err := LoadFeeds("/nonexistent/path/feeds.yaml")
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})

	t.Run("feedsキーなし", func(t *testing.T) {
		f := writeTempFile(t, "other: value\n")
		feeds, err := LoadFeeds(f)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(feeds) != 0 {
			t.Fatalf("got %d feeds, want 0", len(feeds))
		}
	})
}

func writeTempFile(t *testing.T, content string) string {
	t.Helper()
	f, err := os.CreateTemp(t.TempDir(), "feeds-*.yaml")
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if _, err := f.WriteString(content); err != nil {
		t.Fatal(err)
	}
	return filepath.Clean(f.Name())
}
