package handler

import (
	"encoding/json"
	"net/http"

	"github.com/newsprism/server/internal/scraper"
)

type FetchRequest struct {
	URL string `json:"url"`
}

func (d *Deps) FetchArticle(w http.ResponseWriter, r *http.Request) {
	var req FetchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "invalid request", 400)
		return
	}
	content, err := scraper.FetchArticleFromUrl(req.URL)
	if err != nil {
		writeError(w, "fetch failed: "+err.Error(), 500)
		return
	}
	writeJSON(w, map[string]string{"content": content})
}
