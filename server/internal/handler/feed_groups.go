package handler

import (
	"net/http"

	"github.com/newsprism/shared/db"
)

func (d *Deps) FeedGroups(w http.ResponseWriter, r *http.Request) {
	groups, err := db.GetFeedGroupsWithItems(r.Context(), d.Pool)
	if err != nil {
		writeError(w, "フィードグループ取得に失敗しました", 500)
		return
	}
	writeJSON(w, groups)
}
