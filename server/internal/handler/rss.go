package handler

import (
	"net/http"

	"github.com/mmcdole/gofeed"
)

func (d *Deps) RSS(w http.ResponseWriter, r *http.Request) {
	feedUrl := r.URL.Query().Get("feedUrl")
	if feedUrl == "" {
		writeError(w, "feedUrl is required", 400)
		return
	}
	parser := gofeed.NewParser()
	feed, err := parser.ParseURL(feedUrl)
	if err != nil {
		writeError(w, "failed to parse feed", 500)
		return
	}
	writeJSON(w, feed)
}
