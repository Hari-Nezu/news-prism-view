package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCORS_OPTIONS(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("next should not be called for OPTIONS")
	})
	handler := CORS(next)

	req := httptest.NewRequest("OPTIONS", "/api/test", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != 204 {
		t.Errorf("got %d, want 204", rec.Code)
	}
	checkCORSHeaders(t, rec)
}

func TestCORS_GET(t *testing.T) {
	nextCalled := false
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		nextCalled = true
		w.WriteHeader(200)
	})
	handler := CORS(next)

	req := httptest.NewRequest("GET", "/api/test", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if !nextCalled {
		t.Error("next handler not called")
	}
	if rec.Code != 200 {
		t.Errorf("got %d, want 200", rec.Code)
	}
	checkCORSHeaders(t, rec)
}

func TestCORS_POST(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(201)
	})
	handler := CORS(next)

	req := httptest.NewRequest("POST", "/api/test", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != 201 {
		t.Errorf("got %d, want 201", rec.Code)
	}
	checkCORSHeaders(t, rec)
}

func checkCORSHeaders(t *testing.T, rec *httptest.ResponseRecorder) {
	t.Helper()
	h := rec.Header()
	if h.Get("Access-Control-Allow-Origin") != "*" {
		t.Errorf("Access-Control-Allow-Origin: got %q", h.Get("Access-Control-Allow-Origin"))
	}
	if h.Get("Access-Control-Allow-Methods") == "" {
		t.Error("Access-Control-Allow-Methods not set")
	}
	if h.Get("Access-Control-Allow-Headers") == "" {
		t.Error("Access-Control-Allow-Headers not set")
	}
}
