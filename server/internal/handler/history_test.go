package handler

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHistorySimilar_BadJSON(t *testing.T) {
	d := &Deps{}
	req := httptest.NewRequest("POST", "/api/history/similar", strings.NewReader("{bad"))
	rec := httptest.NewRecorder()
	d.HistorySimilar(rec, req)

	if rec.Code != 400 {
		t.Errorf("got %d, want 400", rec.Code)
	}
	assertErrorBody(t, rec, "invalid request")
}
