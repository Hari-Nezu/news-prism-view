package handler

import (
	"net/http/httptest"
	"testing"
)

func TestRSS_MissingFeedURL(t *testing.T) {
	d := &Deps{}
	req := httptest.NewRequest("GET", "/api/rss", nil)
	rec := httptest.NewRecorder()
	d.RSS(rec, req)

	if rec.Code != 400 {
		t.Errorf("got %d, want 400", rec.Code)
	}
	assertErrorBody(t, rec, "feedUrl is required")
}
