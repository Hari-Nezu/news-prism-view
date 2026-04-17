package pipeline

import (
	"context"
	"log/slog"
	"time"

	"github.com/newsprism/batch/internal/config"
	"github.com/newsprism/shared/db"
	"github.com/newsprism/shared/llm"
	"github.com/newsprism/batch/internal/pipeline/steps"
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

// Run executes the full pipeline: collect → embed → classify → group → refine → name → store.
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

	embedClient    := llm.NewEmbedClient(cfg.EmbedBaseURL, cfg.EmbedModel)
	chatClient     := llm.NewChatClient(cfg.LLMBaseURL, cfg.LLMModel)
	classifyClient := llm.NewChatClient(cfg.LLMBaseURL, cfg.ClassifyModel)

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
	clusters := steps.GroupArticles(articles, cfg.GroupClusterThreshold)
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

	// 7. store
	slog.Info("pipeline: store start")
	elapsed := int(time.Since(start).Milliseconds())
	snapshotID, err := steps.Store(ctx, pool, clusters, titles, elapsed, cfg.TimeDecayHalfLifeHours)
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

func partialResult(start time.Time, errMsg string) Result {
	return Result{
		DurationMs: int(time.Since(start).Milliseconds()),
		Status:     "partial",
		Error:      errMsg,
	}
}
