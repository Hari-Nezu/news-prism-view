package pipeline

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"time"

	"github.com/newsprism/batch/internal/config"
	"github.com/newsprism/batch/internal/pipeline/steps"
	"github.com/newsprism/shared/db"
	"github.com/newsprism/shared/llm"
)

// Result summarises a pipeline run.
type Result struct {
	SnapshotID   string `json:"snapshotId,omitempty"`
	ArticleCount int    `json:"articleCount"`
	GroupCount   int    `json:"groupCount"`
	DurationMs   int    `json:"durationMs"`
	Status       string `json:"status"`
	Error        string `json:"error,omitempty"`
}

// Run executes the full pipeline: collect → embed → classify → group → refine → name → consensus → store.
func Run(ctx context.Context, pool *db.Pool, cfg config.Config, feeds []config.FeedConfig) Result {
	start := time.Now()

	acquired, err := db.AcquirePipelineLock(ctx, pool)
	if err != nil {
		return Result{Status: "failed", Error: "lock error: " + err.Error()}
	}
	if !acquired {
		return Result{Status: "failed", Error: "別のバッチが実行中です"}
	}
	defer db.ReleasePipelineLock(ctx, pool)

	embedClient := llm.NewEmbedClient(cfg.EmbedBaseURL, cfg.EmbedModel)
	chatClient := llm.NewChatClient(cfg.LLMBaseURL, cfg.LLMModel)
	classifyClient := llm.NewChatClient(cfg.LLMBaseURL, cfg.ClassifyModel)

	slog.Info("pipeline: embedModel:", cfg.EmbedModel)
	slog.Info("pipeline: llmModel:", cfg.LLMModel)
	slog.Info("pipeline: classifyModel:", cfg.ClassifyModel)

	refineBaseURL := cfg.RefineBaseURL
	if refineBaseURL == "" {
		refineBaseURL = cfg.LLMBaseURL
	}
	refineModel := cfg.RefineModel
	if refineModel == "" {
		refineModel = cfg.LLMModel
	}
	refineClient := llm.NewChatClient(refineBaseURL, refineModel)

	// 1. collect
	slog.Info("pipeline: collect start", "feeds", len(feeds))
	if _, err := steps.Collect(ctx, pool, feeds); err != nil {
		slog.Error("collect failed", "err", err)
		return partialResult(start, "collect failed: "+err.Error())
	}

	// 2. embed
	slog.Info("pipeline: embed start")
	if err := steps.Embed(ctx, pool, embedClient); err != nil {
		slog.Error("embed failed", "err", err)
		return partialResult(start, "embed failed: "+err.Error())
	}

	// 3. classify
	slog.Info("pipeline: classify start")
	if err := steps.Classify(ctx, pool, embedClient, classifyClient, cfg.EmbedClassifyThreshold); err != nil {
		slog.Error("classify failed", "err", err)
		return partialResult(start, "classify failed: "+err.Error())
	}

	// 4. group
	slog.Info("pipeline: group start")
	articles, err := db.GetRecentEmbeddedArticles(ctx, pool)
	if err != nil {
		return partialResult(start, "get articles failed: "+err.Error())
	}
	var clusters []steps.Cluster
	if cfg.UseBERTopic {
		slog.Info("pipeline: group using BERTopic")
		clusters = steps.GroupArticlesBERTopic(ctx, articles, cfg.BERTopicConfig)
	} else {
		clusters = steps.GroupArticles(articles, cfg.GroupClusterThreshold)
	}
	slog.Info("pipeline: group done", "clusters", len(clusters), "articles", len(articles))

	// 5. refine
	if cfg.SkipRefine {
		slog.Info("pipeline: refine skipped (SKIP_REFINE=true)")
	} else {
		slog.Info("pipeline: refine start")
		clusters = steps.RefineClusters(ctx, refineClient, clusters, cfg.RefineIntraThreshold, cfg.RefineInterThreshold)
		slog.Info("pipeline: refine done", "clusters", len(clusters))
	}

	// 6. name
	slog.Info("pipeline: name start")
	titles := steps.NameClusters(ctx, chatClient, clusters)

	// 7. consensus
	slog.Info("pipeline: consensus start")
	consensus := steps.ComputeConsensus(ctx, chatClient, clusters)

	// dump log (group + consensus + similarity)
	dumpGroupLog(clusters, consensus)

	// 8. store
	slog.Info("pipeline: store start")
	elapsed := int(time.Since(start).Milliseconds())
	snapshotID, err := steps.Store(ctx, pool, clusters, titles, consensus, elapsed, cfg.TimeDecayHalfLifeHours)
	if err != nil {
		return partialResult(start, "store failed: "+err.Error())
	}

	slog.Info("pipeline: complete",
		"snapshotId", snapshotID,
		"groups", len(clusters),
		"articles", steps.TotalArticles(clusters),
		"ms", elapsed,
	)
	return Result{
		SnapshotID:   snapshotID,
		ArticleCount: steps.TotalArticles(clusters),
		GroupCount:   len(clusters),
		DurationMs:   elapsed,
		Status:       "success",
	}
}

// Rename re-runs only the name step on the latest snapshot and updates group titles in DB.
func Rename(ctx context.Context, pool *db.Pool, cfg config.Config) Result {
	start := time.Now()

	snap, err := db.GetLatestSnapshotWithGroups(ctx, pool)
	if err != nil {
		return Result{Status: "failed", Error: "get snapshot: " + err.Error()}
	}

	chatClient := llm.NewChatClient(cfg.LLMBaseURL, cfg.LLMModel)

	// Convert SnapshotGroups → Clusters (name step only needs Title/Category/Source)
	clusters := make([]steps.Cluster, len(snap.Groups))
	groupIDs := make([]string, len(snap.Groups))
	for i, g := range snap.Groups {
		articles := make([]db.Article, len(g.Items))
		for j, item := range g.Items {
			articles[j] = db.Article{
				Title:    item.Title,
				Category: item.Category,
				Source:   item.Source,
			}
		}
		clusters[i] = steps.Cluster{Articles: articles}
		groupIDs[i] = g.ID
	}

	slog.Info("rename: name start", "snapshotId", snap.ID, "groups", len(clusters))
	titles := steps.NameClusters(ctx, chatClient, clusters)

	updates := make(map[string]string, len(groupIDs))
	for i, id := range groupIDs {
		updates[id] = titles[i]
	}
	if err := db.UpdateSnapshotGroupTitles(ctx, pool, updates); err != nil {
		return Result{Status: "failed", Error: "update titles: " + err.Error()}
	}

	slog.Info("rename: done", "snapshotId", snap.ID, "groups", len(clusters))
	return Result{
		SnapshotID: snap.ID,
		GroupCount: len(clusters),
		DurationMs: int(time.Since(start).Milliseconds()),
		Status:     "success",
	}
}

// dumpGroupLog はグルーピング結果を logs/group_YYYYMMDD_HHMMSS.json に書き出す。
func dumpGroupLog(clusters []steps.Cluster, consensus []steps.ConsensusResult) {
	type articleEntry struct {
		Title    string `json:"title"`
		Source   string `json:"source"`
		Category string `json:"category"`
		URL      string `json:"url"`
	}
	type clusterEntry struct {
		Index         int                   `json:"index"`
		Size          int                   `json:"size"`
		DomCate       string                `json:"dominant_category"`
		AvgSimilarity float64               `json:"avg_similarity"`
		Articles      []articleEntry        `json:"articles"`
		Consensus     []steps.CoveragePoint `json:"consensus,omitempty"`
	}

	entries := make([]clusterEntry, len(clusters))
	for i, c := range clusters {
		arts := make([]articleEntry, len(c.Articles))
		for j, a := range c.Articles {
			arts[j] = articleEntry{Title: a.Title, Source: a.Source, Category: a.Category, URL: a.URL}
		}
		var points []steps.CoveragePoint
		if i < len(consensus) && len(consensus[i].Points) > 0 {
			points = consensus[i].Points
		}
		entries[i] = clusterEntry{
			Index:         i,
			Size:          len(c.Articles),
			DomCate:       c.DomCate,
			AvgSimilarity: c.AvgSimilarity,
			Articles:      arts,
			Consensus:     points,
		}
	}

	dir := "logs"
	if err := os.MkdirAll(dir, 0o755); err != nil {
		slog.Warn("dumpGroupLog: mkdir failed", "err", err)
		return
	}
	filename := filepath.Join(dir, fmt.Sprintf("group_%s.json", time.Now().Format("20060102_150405")))
	data, _ := json.MarshalIndent(entries, "", "  ")
	if err := os.WriteFile(filename, data, 0o644); err != nil {
		slog.Warn("dumpGroupLog: write failed", "err", err)
		return
	}
	slog.Info("pipeline: group log written", "path", filename)
}

func partialResult(start time.Time, errMsg string) Result {
	return Result{
		DurationMs: int(time.Since(start).Milliseconds()),
		Status:     "partial",
		Error:      errMsg,
	}
}
