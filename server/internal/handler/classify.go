package handler

import (
	"encoding/json"
	"net/http"

	"github.com/newsprism/server/internal/classifier"
)

type ClassifyRequest struct {
	Title   string `json:"title"`
	Summary string `json:"summary"`
}

func (d *Deps) Classify(w http.ResponseWriter, r *http.Request) {
	var req ClassifyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "invalid request", 400)
		return
	}
	if req.Title == "" {
		writeError(w, "title is required", 400)
		return
	}

	result, err := classifier.Classify(r.Context(), d.ClassifyClient, req.Title, req.Summary)
	if err != nil {
		writeError(w, "classification failed: "+err.Error(), 500)
		return
	}

	writeJSON(w, result)
}
