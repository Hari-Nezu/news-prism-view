package handler

import (
	"net/http"
	"time"

	"github.com/newsprism/server/internal/analyzer"
	"github.com/newsprism/server/internal/sse"
)

// SSEArticle is the shape sent to the frontend via SSE.
type SSEArticle struct {
	Title       string                `json:"title"`
	URL         string                `json:"url"`
	Source      string                `json:"source"`
	PublishedAt *string               `json:"publishedAt,omitempty"`
	ImageURL    *string               `json:"imageUrl,omitempty"`
	Content     string                `json:"content"`
	Analysis    *analyzer.AnalysisResult `json:"analysis"`
	AnalyzedAt  string                `json:"analyzedAt"`
}

// SSEAnalyzeItem is a single item to analyze.
type SSEAnalyzeItem struct {
	Title       string
	URL         string
	Source      string
	PublishedAt *string
	ImageURL    *string
	Content     string // pre-resolved content to analyze
}

// streamAnalyze runs analyzer.Analyze for each item and streams results via SSE.
func (d *Deps) streamAnalyze(w http.ResponseWriter, r *http.Request, items []SSEAnalyzeItem) {
	sw := sse.NewWriter(w)
	sw.Init()

	for _, item := range items {
		result, err := analyzer.Analyze(r.Context(), d.ChatClient, item.Title, item.Content)
		if err != nil {
			continue
		}

		art := SSEArticle{
			Title:       item.Title,
			URL:         item.URL,
			Source:      item.Source,
			PublishedAt: item.PublishedAt,
			ImageURL:    item.ImageURL,
			Content:     item.Content,
			Analysis:    result,
			AnalyzedAt:  time.Now().Format(time.RFC3339),
		}
		sw.Send("article", map[string]any{"article": art}) //nolint:errcheck
	}

	sw.Send("done", map[string]any{"total": len(items)}) //nolint:errcheck
}
