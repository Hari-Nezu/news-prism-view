package handler

import (
	"encoding/json"
	"net/http"

	"github.com/newsprism/server/internal/scraper"
)

func (d *Deps) CompareAnalyze(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Items []struct {
			Title       string  `json:"title"`
			URL         string  `json:"url"`
			Source      string  `json:"source"`
			PublishedAt *string `json:"publishedAt"`
		} `json:"items"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "invalid request", 400)
		return
	}
	if len(req.Items) == 0 {
		writeError(w, "items is required", 400)
		return
	}

	items := make([]SSEAnalyzeItem, len(req.Items))
	for i, item := range req.Items {
		content, err := scraper.FetchArticleFromUrl(item.URL)
		if err != nil || len([]rune(content)) < 10 {
			content = item.Title
		}
		items[i] = SSEAnalyzeItem{
			Title:       item.Title,
			URL:         item.URL,
			Source:      item.Source,
			PublishedAt: item.PublishedAt,
			Content:     content,
		}
	}

	d.streamAnalyze(w, r, items)
}
