package handler

import (
	"net/http"

	"github.com/newsprism/shared/db"
)

func (d *Deps) History(w http.ResponseWriter, r *http.Request) {
	articles, err := db.GetRecentArticles(r.Context(), d.Pool)
	if err != nil {
		writeError(w, "履歴取得に失敗しました", 500)
		return
	}
	writeJSON(w, articles)
}

func (d *Deps) HistorySimilar(w http.ResponseWriter, r *http.Request) {
	// TODO: implement similarity search
	writeError(w, "Not implemented", 501)
}
