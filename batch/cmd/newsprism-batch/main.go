package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/newsprism/batch/internal/config"
	"github.com/newsprism/shared/db"
	"github.com/newsprism/batch/internal/pipeline"
	"github.com/robfig/cron/v3"
)

func main() {
	logLevel := slog.LevelInfo
	if os.Getenv("DEBUG") != "" {
		logLevel = slog.LevelDebug
	}
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
		Level: logLevel,
	})))

	if len(os.Args) < 2 {
		fmt.Fprintf(os.Stderr, "usage: %s [run|serve]\n", os.Args[0])
		os.Exit(1)
	}

	cfg := config.Load()

	feeds, err := config.LoadFeeds(cfg.FeedsYAMLPath)
	if err != nil {
		slog.Error("failed to load feeds", "path", cfg.FeedsYAMLPath, "err", err)
		os.Exit(1)
	}
	activeFeeds := config.DefaultEnabledFeeds(feeds)
	slog.Info("feeds loaded", "total", len(feeds), "active", len(activeFeeds))

	ctx := context.Background()
	pool, err := db.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		slog.Error("failed to connect to database", "err", err)
		os.Exit(1)
	}
	defer pool.Close()

	switch os.Args[1] {
	case "run":
		result := pipeline.Run(ctx, pool, cfg, activeFeeds)
		out, _ := json.MarshalIndent(result, "", "  ")
		fmt.Println(string(out))
		if result.Status == "failed" {
			os.Exit(1)
		}

	case "rename":
		result := pipeline.Rename(ctx, pool, cfg)
		out, _ := json.MarshalIndent(result, "", "  ")
		fmt.Println(string(out))
		if result.Status == "failed" {
			os.Exit(1)
		}

	case "serve":
		runServe(ctx, pool, cfg, activeFeeds)

	default:
		fmt.Fprintf(os.Stderr, "unknown command: %s\n", os.Args[1])
		os.Exit(1)
	}
}

func runServe(ctx context.Context, pool *db.Pool, cfg config.Config, feeds []config.FeedConfig) {
	// Built-in cron scheduler: run at the top of every hour
	c := cron.New()
	c.AddFunc("0 * * * *", func() {
		slog.Info("cron: pipeline triggered")
		pipeline.Run(ctx, pool, cfg, feeds)
	})
	c.Start()
	defer c.Stop()

	mux := http.NewServeMux()

	mux.HandleFunc("POST /run", func(w http.ResponseWriter, r *http.Request) {
		slog.Info("manual run triggered")
		result := pipeline.Run(r.Context(), pool, cfg, feeds)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)
	})

	mux.HandleFunc("POST /rename", func(w http.ResponseWriter, r *http.Request) {
		slog.Info("rename triggered")
		result := pipeline.Rename(r.Context(), pool, cfg)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)
	})

	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	addr := ":" + cfg.BatchPort
	slog.Info("serve started", "addr", addr)

	srv := &http.Server{Addr: addr, Handler: mux}
	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server error", "err", err)
		}
	}()

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig

	slog.Info("shutting down")
	srv.Shutdown(ctx)
}
