package handler

import (
	"encoding/json"
	"net/http"

	"github.com/newsprism/shared/db"
)

type SimilarRequest struct {
	Embedding []float32 `json:"embedding"`
	Limit     int       `json:"limit"`
}

func (d *Deps) HistorySimilar(w http.ResponseWriter, r *http.Request) {
	var req SimilarRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "invalid request", 400)
		return
	}
	if req.Limit <= 0 {
		req.Limit = 10
	} else if req.Limit > 100 {
		req.Limit = 100
	}
	arts, err := db.FindSimilarArticles(r.Context(), d.Pool, req.Embedding, req.Limit)
	if err != nil {
		writeError(w, err.Error(), 500)
		return
	}
	writeJSON(w, arts)
}

func (d *Deps) History(w http.ResponseWriter, r *http.Request) {
	arts, err := db.GetRecentArticles(r.Context(), d.Pool)
	if err != nil {
		writeError(w, err.Error(), 500)
		return
	}
	writeJSON(w, arts)
}
