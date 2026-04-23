package handler

import (
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"

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

// BatchRegroupSuggest はLLMに記事の移動先を判定させる。
func (d *Deps) BatchRegroupSuggest(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SnapshotID string `json:"snapshotId"`
		GroupID    string `json:"groupId"`
		ArticleURL string `json:"articleUrl"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "invalid request", 400)
		return
	}
	if req.SnapshotID == "" || req.GroupID == "" || req.ArticleURL == "" {
		writeError(w, "snapshotId, groupId, articleUrl are required", 400)
		return
	}

	ctx := r.Context()

	// 対象記事の情報を取得
	detail, err := db.GetSnapshotGroupDetail(ctx, d.Pool, req.GroupID)
	if err != nil {
		writeError(w, "グループ取得に失敗: "+err.Error(), 500)
		return
	}
	var articleTitle string
	for _, a := range detail.Articles {
		if a.URL == req.ArticleURL {
			articleTitle = a.Title
			break
		}
	}
	if articleTitle == "" {
		writeError(w, "指定された記事がグループ内に見つかりません", 404)
		return
	}

	// 候補グループ一覧を取得
	candidates, err := db.GetCandidateGroupsForRegroup(ctx, d.Pool, req.SnapshotID, req.GroupID)
	if err != nil {
		writeError(w, "候補グループ取得に失敗: "+err.Error(), 500)
		return
	}

	// LLMプロンプト構築
	var sb strings.Builder
	fmt.Fprintf(&sb, "除外対象記事:\n  タイトル: %s\n  現在のグループ: %s\n\n", articleTitle, detail.GroupTitle)
	sb.WriteString("候補グループ一覧:\n")
	for i, c := range candidates {
		fmt.Fprintf(&sb, "  [%d] %s (id: %s)\n", i, c.GroupTitle, c.GroupID)
	}

	const regroupSystemPrompt = `あなたはニュースクラスタの品質管理者です。
ユーザーが「このグループに合わない」と判断した記事について、移動先として最も適切なグループを候補一覧から選んでください。

判定基準:
- 記事のタイトルと候補グループのタイトルを意味的に比較する
- 同じニューストピックを扱っているグループを選ぶ
- 適切な候補がない場合は「該当なし」と判定する

必ずJSON形式のみで回答してください。
出力フォーマット:
適切な候補がある場合: {"targetGroupId": "...", "targetGroupTitle": "...", "reason": "..."}
該当なしの場合: {"targetGroupId": null, "reason": "..."}`

	content, err := d.ChatClient.Complete(ctx, regroupSystemPrompt, sb.String(), 1024)
	if err != nil {
		slog.Warn("regroup LLM error", "err", err)
		writeError(w, "LLM判定に失敗: "+err.Error(), 500)
		return
	}

	// LLMレスポンスをパース
	// extractJSON相当の処理
	jsonStr := content
	if start := strings.Index(jsonStr, "{"); start >= 0 {
		if end := strings.LastIndex(jsonStr, "}"); end >= start {
			jsonStr = jsonStr[start : end+1]
		}
	}

	var suggestion struct {
		TargetGroupID    *string `json:"targetGroupId"`
		TargetGroupTitle string  `json:"targetGroupTitle"`
		Reason           string  `json:"reason"`
	}
	if err := json.Unmarshal([]byte(jsonStr), &suggestion); err != nil {
		slog.Warn("regroup JSON parse error", "err", err, "raw", content)
		writeError(w, "LLM応答のパースに失敗", 500)
		return
	}

	writeJSON(w, map[string]any{
		"articleUrl":       req.ArticleURL,
		"articleTitle":     articleTitle,
		"fromGroupId":     req.GroupID,
		"fromGroupTitle":  detail.GroupTitle,
		"targetGroupId":   suggestion.TargetGroupID,
		"targetGroupTitle": suggestion.TargetGroupTitle,
		"reason":          suggestion.Reason,
	})
}

// BatchRegroupApply は記事の移動を実行する。
func (d *Deps) BatchRegroupApply(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SnapshotID    string  `json:"snapshotId"`
		GroupID       string  `json:"groupId"`
		ArticleURL    string  `json:"articleUrl"`
		TargetGroupID *string `json:"targetGroupId"` // nullなら単独グループ化
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "invalid request", 400)
		return
	}
	if req.SnapshotID == "" || req.GroupID == "" || req.ArticleURL == "" {
		writeError(w, "snapshotId, groupId, articleUrl are required", 400)
		return
	}

	ctx := r.Context()

	if req.TargetGroupID != nil && *req.TargetGroupID != "" {
		// 既存グループに移動
		if err := db.MoveArticleToGroup(ctx, d.Pool, req.ArticleURL, req.GroupID, *req.TargetGroupID); err != nil {
			writeError(w, "移動に失敗: "+err.Error(), 500)
			return
		}
		writeJSON(w, map[string]any{"ok": true, "action": "moved", "targetGroupId": *req.TargetGroupID})
	} else {
		// 単独グループとして切り出し
		// 記事タイトルをグループ名に使う
		detail, err := db.GetSnapshotGroupDetail(ctx, d.Pool, req.GroupID)
		if err != nil {
			writeError(w, "グループ取得に失敗: "+err.Error(), 500)
			return
		}
		var title string
		for _, a := range detail.Articles {
			if a.URL == req.ArticleURL {
				title = a.Title
				break
			}
		}
		if title == "" {
			writeError(w, "記事が見つかりません", 404)
			return
		}
		newID, err := db.CreateSoloGroupAndMoveArticle(ctx, d.Pool, req.ArticleURL, req.GroupID, req.SnapshotID, title)
		if err != nil {
			writeError(w, "単独グループ化に失敗: "+err.Error(), 500)
			return
		}
		writeJSON(w, map[string]any{"ok": true, "action": "solo", "newGroupId": newID})
	}
}
