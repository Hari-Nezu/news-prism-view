package handler

import "net/http"

func Register(mux *http.ServeMux, d *Deps) {
	// Batch
	mux.HandleFunc("GET /api/batch/latest", d.BatchLatest)
	mux.HandleFunc("GET /api/batch/history", d.BatchHistory)
	mux.HandleFunc("POST /api/batch/run", d.BatchRun)
	mux.HandleFunc("GET /api/batch/inspect", d.BatchInspect)
	mux.HandleFunc("POST /api/batch/inspect/recompute", d.BatchInspectRecompute)
	mux.HandleFunc("POST /api/batch/inspect/regroup/suggest", d.BatchRegroupSuggest)
	mux.HandleFunc("POST /api/batch/inspect/regroup/apply", d.BatchRegroupApply)

	// Config
	mux.HandleFunc("GET /api/config", d.Config_)

	// Feed Groups
	mux.HandleFunc("GET /api/feed-groups", d.FeedGroups)

	// History
	mux.HandleFunc("GET /api/history", d.History)
	mux.HandleFunc("POST /api/history/similar", d.HistorySimilar)

	// RSS
	mux.HandleFunc("GET /api/rss", d.RSS)

	// YouTube
	mux.HandleFunc("GET /api/youtube/feed", d.YouTubeFeed)
	mux.HandleFunc("POST /api/youtube/analyze", d.YouTubeAnalyze)

	// Analyze / Classify
	mux.HandleFunc("POST /api/analyze", d.Analyze)
	mux.HandleFunc("POST /api/classify", d.Classify)

	// Compare
	mux.HandleFunc("POST /api/compare/analyze", d.CompareAnalyze)

	// Fetch Article
	mux.HandleFunc("POST /api/fetch-article", d.FetchArticle)
}
