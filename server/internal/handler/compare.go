package handler

import (
	"net/http"
	"os"

	"github.com/newsprism/server/internal/grouper"
	"github.com/newsprism/server/internal/rss"
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
	writeJSON(w, map[string]string{"status": "todo"})
}
