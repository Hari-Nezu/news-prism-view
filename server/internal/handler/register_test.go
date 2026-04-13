package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/newsprism/shared/config"
)

// safeRoutes は DB/LLM なしで安全に呼べるルートと期待ステータス。
var safeRoutes = []struct {
	method string
	path   string
	want   int
}{
	{"GET", "/api/config", 200},
	{"POST", "/api/batch/inspect/recompute", 501},
	{"GET", "/api/batch/inspect", 400},     // id 未指定 → 400
	{"GET", "/api/rss", 400},               // feedUrl 未指定 → 400
	{"GET", "/api/youtube/feed", 200},
	{"POST", "/api/classify", 400},         // 空ボディ → 400
	{"POST", "/api/fetch-article", 400},    // 不正ボディ → 400
	{"POST", "/api/youtube/analyze", 400},  // 空ボディ → 400
}

func TestRegister_SafeRoutes(t *testing.T) {
	mux := http.NewServeMux()
	d := &Deps{Config: config.SharedConfig{LLMModel: "test"}}
	Register(mux, d)

	srv := httptest.NewServer(mux)
	defer srv.Close()

	client := srv.Client()
	for _, tt := range safeRoutes {
		t.Run(tt.method+" "+tt.path, func(t *testing.T) {
			req, err := http.NewRequest(tt.method, srv.URL+tt.path, nil)
			if err != nil {
				t.Fatal(err)
			}
			resp, err := client.Do(req)
			if err != nil {
				t.Fatal(err)
			}
			resp.Body.Close()

			if resp.StatusCode == 404 {
				t.Errorf("route not registered: %s %s → 404", tt.method, tt.path)
			}
			if resp.StatusCode != tt.want {
				t.Errorf("got %d, want %d", resp.StatusCode, tt.want)
			}
		})
	}
}
