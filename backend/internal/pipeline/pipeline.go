package pipeline

import (
	"context"
	"log/slog"
	"time"

	"github.com/newsprism/batch/internal/config"
	"github.com/newsprism/batch/internal/db"
	"github.com/newsprism/batch/internal/llm"
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

// Run executes the full pipeline: collect → embed → classify → group → name → store.
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

	embedClient := llm.NewEmbedClient(cfg.LLMBaseURL, cfg.EmbedModel)
	chatClient := llm.NewChatClient(cfg.LLMBaseURL, cfg.LLMModel)

	// 1. collect
	slog.Info("pipeline: collect start", "feeds", len(feeds))
	if _, err := Collect(ctx, pool, feeds); err != nil {
		slog.Error("collect failed", "err", err)
		return partialResult(start, "collect failed: "+err.Error())
	}

	// 2. embed
	slog.Info("pipeline: embed start")
	if err := Embed(ctx, pool, embedClient); err != nil {
		slog.Error("embed failed", "err", err)
		return partialResult(start, "embed failed: "+err.Error())
	}

	// 3. classify
	slog.Info("pipeline: classify start")
	if err := Classify(ctx, pool); err != nil {
		slog.Error("classify failed", "err", err)
		return partialResult(start, "classify failed: "+err.Error())
	}

	// 4. group
	slog.Info("pipeline: group start")
	articles, err := db.GetRecentEmbeddedArticles(ctx, pool)
	if err != nil {
		return partialResult(start, "get articles failed: "+err.Error())
	}
	clusters := GroupArticles(articles, cfg.GroupClusterThreshold)
	slog.Info("pipeline: group done", "clusters", len(clusters), "articles", len(articles))

	// 5. name
	slog.Info("pipeline: name start")
	titles := NameClusters(ctx, chatClient, clusters)

	// 6. store
	slog.Info("pipeline: store start")
	elapsed := int(time.Since(start).Milliseconds())
	snapshotID, err := Store(ctx, pool, clusters, titles, elapsed, cfg.TimeDecayHalfLifeHours)
	if err != nil {
		return partialResult(start, "store failed: "+err.Error())
	}

	slog.Info("pipeline: complete",
		"snapshotId", snapshotID,
		"groups", len(clusters),
		"articles", totalArticles(clusters),
		"ms", elapsed,
	)
	return Result{
		SnapshotID:   snapshotID,
		ArticleCount: totalArticles(clusters),
		GroupCount:   len(clusters),
		DurationMs:   elapsed,
		Status:       "success",
	}
}

func partialResult(start time.Time, errMsg string) Result {
	return Result{
		DurationMs: int(time.Since(start).Milliseconds()),
		Status:     "partial",
		Error:      errMsg,
	}
}
