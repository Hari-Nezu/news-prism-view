package handler

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestAnalyze_BadJSON(t *testing.T) {
	d := &Deps{}
	req := httptest.NewRequest("POST", "/api/analyze", strings.NewReader("{bad"))
	rec := httptest.NewRecorder()
	d.Analyze(rec, req)

	if rec.Code != 400 {
		t.Errorf("got %d, want 400", rec.Code)
	}
}

func TestAnalyze_EmptyTitle(t *testing.T) {
	d := &Deps{}
	body := `{"title":"","content":"十分な長さのコンテンツ"}`
	req := httptest.NewRequest("POST", "/api/analyze", strings.NewReader(body))
	rec := httptest.NewRecorder()
	d.Analyze(rec, req)

	if rec.Code != 400 {
		t.Errorf("got %d, want 400", rec.Code)
	}
	assertErrorBody(t, rec, "invalid data")
}

func TestAnalyze_ContentTooShort(t *testing.T) {
	d := &Deps{}
	body := `{"title":"タイトル","content":"短い"}`
	req := httptest.NewRequest("POST", "/api/analyze", strings.NewReader(body))
	rec := httptest.NewRecorder()
	d.Analyze(rec, req)

	if rec.Code != 400 {
		t.Errorf("got %d, want 400", rec.Code)
	}
	assertErrorBody(t, rec, "invalid data")
}

func TestAnalyze_Success_SingleModel(t *testing.T) {
	// ChatClient が返す分析JSON
	analysisJSON := `{"economic":0.1,"social":0.0,"diplomatic":-0.2,"emotional_tone":0.0,"bias_warning":false,"summary":"テスト要約","counter_opinion":"反論","confidence":0.8}`
	chatSrv := fakeLLMServer(t, analysisJSON)
	defer chatSrv.Close()

	// ClassifyClient が返す分類JSON (classify は error を無視するので不正でもOK)
	classifyJSON := `{"category":"politics","subcategory":"domestic_politics","confidence":0.8}`
	classifySrv := fakeLLMServer(t, classifyJSON)
	defer classifySrv.Close()

	// EmbedClient は非同期goroutineで呼ばれる。失敗させてgoroutineを早期returnさせる。
	embedSrv := failLLMServer(t)
	defer embedSrv.Close()

	d := &Deps{
		ChatClient:     newChatClient(chatSrv),
		ClassifyClient: newChatClient(classifySrv),
		EmbedClient:    newEmbedClient(embedSrv),
		Pool:           nil, // EmbedがエラーになるのでSaveArticleは呼ばれない
	}

	body := `{"title":"テスト記事タイトル","content":"これは十分な長さのコンテンツです。テスト用の記事本文。"}`
	req := httptest.NewRequest("POST", "/api/analyze", strings.NewReader(body))
	rec := httptest.NewRecorder()
	d.Analyze(rec, req)

	if rec.Code != 200 {
		t.Errorf("got %d, want 200 (body: %s)", rec.Code, rec.Body.String())
	}
	var got map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if _, ok := got["analysis"]; !ok {
		t.Error("response missing 'analysis' field")
	}
	if _, ok := got["category"]; !ok {
		t.Error("response missing 'category' field")
	}
}
