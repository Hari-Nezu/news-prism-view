package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/newsprism/server/internal/analyzer"
	"github.com/newsprism/server/internal/classifier"
	"github.com/newsprism/server/internal/sse"
	"github.com/newsprism/shared/db"
	"github.com/newsprism/shared/llm"
)

type AnalyzeRequest struct {
	Title      string `json:"title"`
	Content    string `json:"content"`
	URL        string `json:"url,omitempty"`
	Source     string `json:"source,omitempty"`
	MultiModel bool   `json:"multiModel,omitempty"`
}

func (d *Deps) Analyze(w http.ResponseWriter, r *http.Request) {
	var req AnalyzeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "invalid request", 400)
		return
	}
	if req.Title == "" || len(req.Content) < 10 {
		writeError(w, "invalid data", 400)
		return
	}

	if !req.MultiModel {
		// Single model
		result, err := analyzer.Analyze(r.Context(), d.ChatClient, req.Title, req.Content)
		if err != nil {
			writeError(w, "analysis failed: "+err.Error(), 500)
			return
		}
		cat, _ := classifier.Classify(r.Context(), d.ClassifyClient, req.Title, result.Summary)

		// Async embed & save — use background context since r.Context() is cancelled after response
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			emb, err := d.EmbedClient.Embed(ctx, result.Summary)
			if err != nil {
				return
			}
			_ = db.SaveArticle(ctx, d.Pool, db.Article{
				URL:         req.URL,
				Title:       req.Title,
				Source:      req.Source,
				Summary:     result.Summary,
				Category:    cat.Category,
				Subcategory: cat.Subcategory,
				Embedding:   emb,
			})
		}()

		writeJSON(w, map[string]any{
			"analysis":    result,
			"category":    cat.Category,
			"subcategory": cat.Subcategory,
		})
		return
	}

	// Multi-model SSE
	sw := sse.NewWriter(w)
	sw.Init()

	// Use multiple models if specified in env, otherwise fallback to default
	models := []string{d.Config.LLMModel} // Placeholder for multi-model logic

	for i, m := range models {
		client := llm.NewChatClient(d.Config.LLMBaseURL, m)
		result, err := analyzer.Analyze(r.Context(), client, req.Title, req.Content)
		if err != nil {
			continue
		}
		sw.Send("model-result", map[string]any{
			"model":  m,
			"result": result,
			"index":  i,
			"total":  len(models),
		})
	}
	sw.Send("done", map[string]any{})
}
