package handler

import (
	"net/http"

	"github.com/newsprism/shared/db"
)

func (d *Deps) BatchLatest(w http.ResponseWriter, r *http.Request) {
	snap, err := db.GetLatestSnapshotWithGroups(r.Context(), d.Pool)
	if err != nil {
		writeError(w, "スナップショット取得に失敗しました: "+err.Error(), 500)
		return
	}
	writeJSON(w, snap)
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
	resp, err := http.Post(d.BatchServerURL+"/run", "", nil)
	if err != nil || resp.StatusCode != 200 {
		writeError(w, "バッチサーバーに接続できませんでした", 502)
		return
	}
	defer resp.Body.Close()
	writeJSON(w, map[string]bool{"ok": true})
}

func (d *Deps) BatchInspect(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	if id == "" {
		writeError(w, "id is required", 400)
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
	// TODO: implement recompute
	writeError(w, "Not implemented", 501)
}
