package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/newsprism/server/internal/handler"
	"github.com/newsprism/server/internal/middleware"
	"github.com/newsprism/shared/config"
	"github.com/newsprism/shared/db"
	"github.com/newsprism/shared/llm"
)

func main() {
	cfg := config.LoadShared()
	ctx := context.Background()

	pool, err := db.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		slog.Error("Failed to connect to database", "err", err)
		os.Exit(1)
	}
	defer pool.Close()

	chatClient := llm.NewChatClient(cfg.LLMBaseURL, cfg.LLMModel)
	classifyClient := llm.NewChatClient(cfg.LLMBaseURL, cfg.ClassifyModel)
	embedClient := llm.NewEmbedClient(cfg.EmbedBaseURL, cfg.EmbedModel)

	deps := &handler.Deps{
		Pool:           pool,
		ChatClient:     chatClient,
		ClassifyClient: classifyClient,
		EmbedClient:    embedClient,
		Config:         cfg,
		BatchServerURL: config.GetEnv("BATCH_SERVER_URL", "http://127.0.0.1:8090"),
	}

	mux := http.NewServeMux()
	handler.Register(mux, deps)

	port := config.GetEnv("API_PORT", "8091")
	srv := &http.Server{
		Addr:    ":" + port,
		Handler: middleware.CORS(mux),
	}

	go func() {
		slog.Info("Starting server", "port", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("Server error", "err", err)
			os.Exit(1)
		}
	}()

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig

	slog.Info("Shutting down server...")
	srv.Shutdown(ctx)
}
