package handler

import (
	"encoding/json"
	"net/http"
	"os"

	"github.com/newsprism/server/internal/grouper"
	"github.com/newsprism/server/internal/rss"
	"github.com/newsprism/server/internal/scraper"
	"github.com/newsprism/shared/db"
)

func (d *Deps) Compare(w http.ResponseWriter, r *http.Request) {
	keyword := r.URL.Query().Get("keyword")
	if keyword == "" {
		writeError(w, "keyword is required", 400)
		return
	}

	feeds, err := rss.LoadFeeds(os.Getenv("FEEDS_YAML_PATH"))
	if err != nil {
		writeError(w, "failed to load feeds", 500)
		return
	}

	allItems, _ := rss.FetchAllFeeds(r.Context(), feeds)
	matched := rss.FilterByKeyword(allItems, keyword)

	var articles []db.Article
	for _, item := range matched {
		articles = append(articles, db.Article{URL: item.Link, Title: item.Title})
	}

	groups := grouper.GroupArticlesByEvent(r.Context(), d.ChatClient, articles, d.Config.GroupClusterThreshold)

	writeJSON(w, map[string]any{
		"groups":       groups,
		"keyword":      keyword,
		"matchedCount": len(articles),
	})
}

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
