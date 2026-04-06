package pipeline

import (
	"context"
	"log/slog"
	"sync"

	"github.com/newsprism/batch/internal/config"
	"github.com/newsprism/batch/internal/db"
	"github.com/newsprism/batch/internal/rss"
)

// Collect fetches all feeds concurrently and upserts articles to DB.
func Collect(ctx context.Context, pool *db.Pool, feeds []config.FeedConfig) ([]db.Article, error) {
	type result struct {
		articles []db.Article
		err      error
		name     string
	}

	results := make(chan result, len(feeds))
	var wg sync.WaitGroup

	for _, feed := range feeds {
		wg.Add(1)
		go func(f config.FeedConfig) {
			defer wg.Done()
			articles, err := rss.FetchFeed(ctx, f)
			results <- result{articles: articles, err: err, name: f.Name}
		}(feed)
	}

	go func() {
		wg.Wait()
		close(results)
	}()

	seen := make(map[string]bool)
	var all []db.Article

	for r := range results {
		if r.err != nil {
			slog.Warn("feed fetch error", "feed", r.name, "err", r.err)
			continue
		}
		slog.Debug("feed fetched", "feed", r.name, "count", len(r.articles))
		for _, a := range r.articles {
			if a.URL == "" || seen[a.URL] {
				continue
			}
			seen[a.URL] = true
			all = append(all, a)
		}
	}

	if err := db.UpsertArticles(ctx, pool, all); err != nil {
		return nil, err
	}
	slog.Info("collect done", "articles", len(all))
	return all, nil
}
