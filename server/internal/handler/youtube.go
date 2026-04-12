package handler

import (
	"encoding/json"
	"net/http"
)

type YouTubeAnalyzeRequest struct {
	VideoIDs []string `json:"videoIds"`
}

func (d *Deps) YouTubeFeed(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, map[string]string{"status": "not implemented"})
}

func (d *Deps) YouTubeAnalyze(w http.ResponseWriter, r *http.Request) {
	var req YouTubeAnalyzeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "invalid request", 400)
		return
	}
	writeJSON(w, map[string]string{"status": "not implemented"})
}
