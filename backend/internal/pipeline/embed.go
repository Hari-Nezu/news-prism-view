package pipeline

import (
	"context"
	"log/slog"

	"github.com/newsprism/batch/internal/db"
	"github.com/newsprism/batch/internal/llm"
)

// Embed computes embeddings for articles that don't have one yet.
func Embed(ctx context.Context, pool *db.Pool, embedClient *llm.EmbedClient) error {
	articles, err := db.GetUnembeddedArticles(ctx, pool)
	if err != nil {
		return err
	}
	if len(articles) == 0 {
		slog.Info("embed: no new articles to embed")
		return nil
	}

	texts := make([]string, len(articles))
	for i, a := range articles {
		text := a.Title
		if a.Summary != "" {
			text = a.Title + "\n" + a.Summary
		}
		texts[i] = text
	}

	vecs, err := embedClient.EmbedBatch(ctx, texts)
	if err != nil {
		return err
	}

	entries := make([]struct {
		URL string
		Vec []float32
	}, 0, len(articles))

	for i, a := range articles {
		if i < len(vecs) && len(vecs[i]) > 0 {
			entries = append(entries, struct {
				URL string
				Vec []float32
			}{a.URL, vecs[i]})
		}
	}

	if err := db.SaveEmbeddings(ctx, pool, entries); err != nil {
		return err
	}
	slog.Info("embed done", "embedded", len(entries), "skipped", len(articles)-len(entries))
	return nil
}
