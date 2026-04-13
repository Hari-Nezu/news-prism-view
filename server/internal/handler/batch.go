package handler

import (
	"encoding/json"
	"io"
	"net/http"

	"github.com/newsprism/shared/db"
)

func (d *Deps) BatchLatest(w http.ResponseWriter, r *http.Request) {
	snap, err := db.GetLatestSnapshotWithGroups(r.Context(), d.Pool)
	if err != nil {
		writeError(w, "スナップショット取得に失敗しました: "+err.Error(), 500)
		return
	}
	groups := snap.Groups
	if groups == nil {
		groups = []db.SnapshotGroup{}
	}
	snap.Groups = nil
	writeJSON(w, map[string]any{
		"snapshot": snap,
		"groups":   groups,
	})
}

func (d *Deps) BatchHistory(w http.ResponseWriter, r *http.Request) {
	history, err := db.GetSnapshotHistory(r.Context(), d.Pool)
	if err != nil {
		writeError(w, "履歴取得に失敗しました: "+err.Error(), 500)
		return
	}
	writeJSON(w, map[string]any{"history": history})
}

func (d *Deps) BatchRun(w http.ResponseWriter, r *http.Request) {
	resp, err := http.Post(d.BatchServerURL+"/run", "application/json", nil)
	if err != nil {
		writeError(w, "バッチサーバーに接続できませんでした", 502)
		return
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)
	if resp.StatusCode != 200 {
		writeError(w, "バッチサーバーに接続できませんでした", 502)
		return
	}
	writeJSON(w, map[string]bool{"ok": true})
}

func (d *Deps) BatchInspect(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("groupId")
	if id == "" {
		writeError(w, "groupId is required", 400)
		return
	}
	group, err := db.GetSnapshotGroupDetail(r.Context(), d.Pool, id)
	if err != nil {
		writeError(w, "グループ詳細取得に失敗しました", 500)
		return
	}
	writeJSON(w, group)
}

func (d *Deps) BatchInspectRecompute(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SnapshotID string `json:"snapshotId"`
		GroupID    string `json:"groupId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "invalid request", 400)
		return
	}
	if req.GroupID == "" {
		writeError(w, "groupId is required", 400)
		return
	}
	result, err := db.RecomputeGroupInspect(r.Context(), d.Pool, req.SnapshotID, req.GroupID, d.Config.GroupClusterThreshold)
	if err != nil {
		writeError(w, "recompute failed: "+err.Error(), 500)
		return
	}
	writeJSON(w, result)
}
