package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/newsprism/shared/llm"
)

// fakeLLMServer は /v1/chat/completions に対して content を返す偽 LLM サーバーを作る。
func fakeLLMServer(t *testing.T, content string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := map[string]any{
			"choices": []map[string]any{
				{"message": map[string]string{"content": content}},
			},
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
}

// failLLMServer は常に 500 を返す偽サーバーを作る。
func failLLMServer(t *testing.T) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		fmt.Fprintln(w, "internal error")
	}))
}

// newChatClient は httptest.Server のURLを使った ChatClient を返す。
func newChatClient(s *httptest.Server) *llm.ChatClient {
	return llm.NewChatClient(s.URL, "test-model")
}

// newEmbedClient は httptest.Server のURLを使った EmbedClient を返す。
func newEmbedClient(s *httptest.Server) *llm.EmbedClient {
	return llm.NewEmbedClient(s.URL, "test-model")
}
