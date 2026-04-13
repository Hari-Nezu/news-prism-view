package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/newsprism/server/internal/youtube"
)

func (d *Deps) YouTubeFeed(w http.ResponseWriter, r *http.Request) {
	raw := r.URL.Query().Get("channels")
	if raw == "" {
		writeError(w, "channels is required", 400)
		return
	}
	ids := strings.Split(raw, ",")
	items := youtube.FetchChannels(r.Context(), ids)
	if items == nil {
		items = []youtube.VideoItem{}
	}
	writeJSON(w, map[string]any{"items": items})
}

func (d *Deps) YouTubeAnalyze(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Items []struct {
			Title       string  `json:"title"`
			URL         string  `json:"url"`
			Source      string  `json:"source"`
			Summary     *string `json:"summary"`
			PublishedAt *string `json:"publishedAt"`
			ImageURL    *string `json:"imageUrl"`
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
		content := item.Title
		if item.Summary != nil && len([]rune(*item.Summary)) >= 10 {
			content = *item.Summary
		}
		items[i] = SSEAnalyzeItem{
			Title:       item.Title,
			URL:         item.URL,
			Source:      item.Source,
			PublishedAt: item.PublishedAt,
			ImageURL:    item.ImageURL,
			Content:     content,
		}
	}

	d.streamAnalyze(w, r, items)
}
