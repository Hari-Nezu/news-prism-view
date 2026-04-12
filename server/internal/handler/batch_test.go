package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestBatchInspect_MissingID(t *testing.T) {
	d := &Deps{}
	req := httptest.NewRequest("GET", "/api/batch/inspect", nil)
	rec := httptest.NewRecorder()
	d.BatchInspect(rec, req)

	if rec.Code != 400 {
		t.Errorf("got %d, want 400", rec.Code)
	}
	assertErrorBody(t, rec, "id is required")
}

func TestBatchInspectRecompute_NotImplemented(t *testing.T) {
	d := &Deps{}
	req := httptest.NewRequest("POST", "/api/batch/inspect/recompute", nil)
	rec := httptest.NewRecorder()
	d.BatchInspectRecompute(rec, req)

	if rec.Code != 501 {
		t.Errorf("got %d, want 501", rec.Code)
	}
}

func TestBatchRun_Success(t *testing.T) {
	batchSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
	}))
	defer batchSrv.Close()

	d := &Deps{BatchServerURL: batchSrv.URL}
	req := httptest.NewRequest("POST", "/api/batch/run", nil)
	rec := httptest.NewRecorder()
	d.BatchRun(rec, req)

	if rec.Code != 200 {
		t.Errorf("got %d, want 200", rec.Code)
	}
	var got map[string]bool
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !got["ok"] {
		t.Error("expected ok=true")
	}
}

func TestBatchRun_BatchServerError(t *testing.T) {
	batchSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(500)
	}))
	defer batchSrv.Close()

	d := &Deps{BatchServerURL: batchSrv.URL}
	req := httptest.NewRequest("POST", "/api/batch/run", nil)
	rec := httptest.NewRecorder()
	d.BatchRun(rec, req)

	if rec.Code != 502 {
		t.Errorf("got %d, want 502", rec.Code)
	}
}

func TestBatchRun_ConnectionRefused(t *testing.T) {
	// 存在しないURLで接続エラーを起こす
	d := &Deps{BatchServerURL: "http://127.0.0.1:1"}
	req := httptest.NewRequest("POST", "/api/batch/run", nil)
	rec := httptest.NewRecorder()
	d.BatchRun(rec, req)

	if rec.Code != 502 {
		t.Errorf("got %d, want 502", rec.Code)
	}
}
