package classifier

import "testing"

func TestTruncate(t *testing.T) {
	t.Run("短い文字列はそのまま", func(t *testing.T) {
		s := "こんにちは"
		if got := truncate(s, 10); got != s {
			t.Errorf("got %q, want %q", got, s)
		}
	})

	t.Run("ちょうどmax", func(t *testing.T) {
		s := "あいうえお"
		if got := truncate(s, 5); got != s {
			t.Errorf("got %q, want %q", got, s)
		}
	})

	t.Run("日本語切り詰め", func(t *testing.T) {
		s := "あいうえおかきくけこさしすせそ" // 15文字
		got := truncate(s, 10)
		if len([]rune(got)) != 10 {
			t.Errorf("got %d runes, want 10", len([]rune(got)))
		}
		if got != "あいうえおかきくけこ" {
			t.Errorf("got %q", got)
		}
	})

	t.Run("ASCII文字列", func(t *testing.T) {
		s := "hello world"
		if got := truncate(s, 5); got != "hello" {
			t.Errorf("got %q, want %q", got, "hello")
		}
	})

	t.Run("空文字列", func(t *testing.T) {
		if got := truncate("", 10); got != "" {
			t.Errorf("got %q, want %q", got, "")
		}
	})
}
