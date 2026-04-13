package handler

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/newsprism/server/internal/classifier"
)

func TestClassify_BadJSON(t *testing.T) {
	d := &Deps{}
	req := httptest.NewRequest("POST", "/api/classify", strings.NewReader("{broken"))
	rec := httptest.NewRecorder()
	d.Classify(rec, req)

	if rec.Code != 400 {
		t.Errorf("got %d, want 400", rec.Code)
	}
	assertErrorBody(t, rec, "invalid request")
}

func TestClassify_EmptyTitle(t *testing.T) {
	d := &Deps{}
	body := `{"title":"","summary":"some summary"}`
	req := httptest.NewRequest("POST", "/api/classify", strings.NewReader(body))
	rec := httptest.NewRecorder()
	d.Classify(rec, req)

	if rec.Code != 400 {
		t.Errorf("got %d, want 400", rec.Code)
	}
	assertErrorBody(t, rec, "title is required")
}

func TestClassify_LLMError(t *testing.T) {
	srv := failLLMServer(t)
	defer srv.Close()

	d := &Deps{ClassifyClient: newChatClient(srv)}
	body := `{"title":"テスト記事","summary":"要約テキスト"}`
	req := httptest.NewRequest("POST", "/api/classify", strings.NewReader(body))
	rec := httptest.NewRecorder()
	d.Classify(rec, req)

	if rec.Code != 500 {
		t.Errorf("got %d, want 500", rec.Code)
	}
}

func TestClassify_Success(t *testing.T) {
	classifyJSON := `{"category":"politics","subcategory":"domestic_politics","confidence":0.9}`
	srv := fakeLLMServer(t, classifyJSON)
	defer srv.Close()

	d := &Deps{ClassifyClient: newChatClient(srv)}
	body := `{"title":"国会で審議中の法案について","summary":"与野党が対立"}`
	req := httptest.NewRequest("POST", "/api/classify", strings.NewReader(body))
	rec := httptest.NewRecorder()
	d.Classify(rec, req)

	if rec.Code != 200 {
		t.Errorf("got %d, want 200", rec.Code)
	}
	var result classifier.ClassificationResult
	if err := json.NewDecoder(rec.Body).Decode(&result); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if result.Category != "politics" {
		t.Errorf("category: got %q, want %q", result.Category, "politics")
	}
	if result.Subcategory != "domestic_politics" {
		t.Errorf("subcategory: got %q, want %q", result.Subcategory, "domestic_politics")
	}
}

// assertErrorBody は {"error":"..."} のボディ検証ヘルパー。
func assertErrorBody(t *testing.T, rec *httptest.ResponseRecorder, contains string) {
	t.Helper()
	var got map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode error body: %v", err)
	}
	if !strings.Contains(got["error"], contains) {
		t.Errorf("error body: got %q, want contains %q", got["error"], contains)
	}
}
