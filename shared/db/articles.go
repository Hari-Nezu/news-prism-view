package db

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	pgvector "github.com/pgvector/pgvector-go"
)

type Article struct {
	URL         string
	Title       string
	Source      string
	Summary     string
	ImageURL    string
	PublishedAt *time.Time
	Category    string
	Subcategory string
	Embedding   []float32
}

// UpsertArticles inserts or updates articles in chunks of 50.
func UpsertArticles(ctx context.Context, pool *pgxpool.Pool, articles []Article) error {
	if len(articles) == 0 {
		return nil
	}
	const chunkSize = 50
	for i := 0; i < len(articles); i += chunkSize {
		end := i + chunkSize
		if end > len(articles) {
			end = len(articles)
		}
		if err := upsertChunk(ctx, pool, articles[i:end]); err != nil {
			return fmt.Errorf("upsert chunk %d: %w", i, err)
		}
	}
	return nil
}

func upsertChunk(ctx context.Context, pool *pgxpool.Pool, chunk []Article) error {
	placeholders := make([]string, len(chunk))
	args := make([]any, 0, len(chunk)*8)
	for j, a := range chunk {
		base := j * 8
		placeholders[j] = fmt.Sprintf(
			"(gen_random_uuid()::text,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,NOW())",
			base+1, base+2, base+3, base+4, base+5, base+6, base+7, base+8,
		)
		var pubAt *time.Time
		if a.PublishedAt != nil {
			pubAt = a.PublishedAt
		}
		args = append(args,
			a.URL, a.Title, a.Source,
			nullStr(a.Summary), nullStr(a.ImageURL), pubAt,
			nullStr(a.Category), nullStr(a.Subcategory),
		)
	}
	sql := fmt.Sprintf(`
		INSERT INTO rss_articles (id, url, title, source, summary, image_url, published_at, category, subcategory, fetched_at)
		VALUES %s
		ON CONFLICT (url) DO UPDATE SET
			category    = COALESCE(EXCLUDED.category, rss_articles.category),
			subcategory = COALESCE(EXCLUDED.subcategory, rss_articles.subcategory),
			fetched_at  = NOW()`,
		strings.Join(placeholders, ","),
	)
	_, err := pool.Exec(ctx, sql, args...)
	return err
}

// GetUnembeddedArticles returns articles without embeddings published in the last 3 days.
func GetUnembeddedArticles(ctx context.Context, pool *pgxpool.Pool) ([]Article, error) {
	rows, err := pool.Query(ctx, `
		SELECT url, title, source, summary
		FROM rss_articles
		WHERE embedded_at IS NULL
		  AND published_at >= NOW() - INTERVAL '3 days'
		ORDER BY published_at DESC NULLS LAST
		LIMIT 200`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var articles []Article
	for rows.Next() {
		var a Article
		var summary *string
		if err := rows.Scan(&a.URL, &a.Title, &a.Source, &summary); err != nil {
			return nil, err
		}
		if summary != nil {
			a.Summary = *summary
		}
		articles = append(articles, a)
	}
	return articles, rows.Err()
}

// GetUnclassifiedArticles returns articles with embeddings but no classification.
func GetUnclassifiedArticles(ctx context.Context, pool *pgxpool.Pool) ([]Article, error) {
	rows, err := pool.Query(ctx, `
		SELECT url, title, source, summary, embedding::text
		FROM rss_articles
		WHERE classified_at IS NULL
		  AND embedded_at IS NOT NULL
		  AND published_at >= NOW() - INTERVAL '3 days'
		ORDER BY published_at DESC NULLS LAST
		LIMIT 200`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var articles []Article
	for rows.Next() {
		var a Article
		var summary *string
		var embStr string
		if err := rows.Scan(&a.URL, &a.Title, &a.Source, &summary, &embStr); err != nil {
			return nil, err
		}
		if summary != nil {
			a.Summary = *summary
		}
		a.Embedding = parseVectorStr(embStr)
		articles = append(articles, a)
	}
	return articles, rows.Err()
}

// GetRecentEmbeddedArticles returns articles with embeddings published in the last 3 days.
func GetRecentEmbeddedArticles(ctx context.Context, pool *pgxpool.Pool) ([]Article, error) {
	rows, err := pool.Query(ctx, `
		SELECT url, title, source, summary, published_at, category, subcategory, embedding::text
		FROM rss_articles
		WHERE embedded_at IS NOT NULL
		  AND published_at >= NOW() - INTERVAL '3 days'
		ORDER BY published_at DESC NULLS LAST`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var articles []Article
	for rows.Next() {
		var a Article
		var summary *string
		var embStr string
		if err := rows.Scan(&a.URL, &a.Title, &a.Source, &summary, &a.PublishedAt, &a.Category, &a.Subcategory, &embStr); err != nil {
			return nil, err
		}
		if summary != nil {
			a.Summary = *summary
		}
		a.Embedding = parseVectorStr(embStr)
		articles = append(articles, a)
	}
	return articles, rows.Err()
}

func GetRecentArticles(ctx context.Context, pool *pgxpool.Pool) ([]Article, error) {
	rows, err := pool.Query(ctx, `
		SELECT url, title, source, summary, published_at, category, subcategory
		FROM rss_articles
		WHERE published_at >= NOW() - INTERVAL '7 days'
		ORDER BY published_at DESC NULLS LAST
		LIMIT 100`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var articles []Article
	for rows.Next() {
		var a Article
		var summary *string
		err := rows.Scan(&a.URL, &a.Title, &a.Source, &summary, &a.PublishedAt, &a.Category, &a.Subcategory)
		if err != nil {
			return nil, err
		}
		if summary != nil {
			a.Summary = *summary
		}
		articles = append(articles, a)
	}
	return articles, rows.Err()
}

// SaveEmbeddings updates the embedding and embeddedAt fields for the given URLs.
func SaveEmbeddings(ctx context.Context, pool *pgxpool.Pool, entries []struct {
	URL string
	Vec []float32
}) error {
	for _, e := range entries {
		vec := pgvector.NewVector(e.Vec)
		_, err := pool.Exec(ctx,
			`UPDATE rss_articles SET embedding = $1, embedded_at = NOW() WHERE url = $2`,
			vec, e.URL,
		)
		if err != nil {
			return err
		}
	}
	return nil
}

// SaveArticle inserts a single article with its embedding.
func SaveArticle(ctx context.Context, pool *pgxpool.Pool, a Article) error {
	_, err := pool.Exec(ctx, `
		INSERT INTO rss_articles (url, title, source, summary, embedding, embedded_at, fetched_at)
		VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
		ON CONFLICT (url) DO UPDATE SET
			embedding = EXCLUDED.embedding,
			embedded_at = NOW()`,
		a.URL, a.Title, a.Source, a.Summary, pgvector.NewVector(a.Embedding),
	)
	return err
}

// SaveClassifications updates the category, subcategory and classifiedAt fields.
func SaveClassifications(ctx context.Context, pool *pgxpool.Pool, entries []struct {
	URL, Category, Subcategory string
}) error {
	for _, e := range entries {
		_, err := pool.Exec(ctx,
			`UPDATE rss_articles SET category = $1, subcategory = $2, classified_at = NOW() WHERE url = $3`,
			e.Category, e.Subcategory, e.URL,
		)
		if err != nil {
			return err
		}
	}
	return nil
}

// FindSimilarArticles performs a vector cosine distance search.
func FindSimilarArticles(ctx context.Context, pool *pgxpool.Pool, embedding []float32, limit int) ([]Article, error) {
	rows, err := pool.Query(ctx, `
		SELECT url, title, source, summary, published_at
		FROM rss_articles
		WHERE embedding IS NOT NULL
		  AND published_at >= NOW() - INTERVAL '30 days'
		ORDER BY embedding <=> $1::vector
		LIMIT $2`,
		pgvector.NewVector(embedding), limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var articles []Article
	for rows.Next() {
		var a Article
		var summary *string
		err := rows.Scan(&a.URL, &a.Title, &a.Source, &summary, &a.PublishedAt)
		if err != nil {
			return nil, err
		}
		if summary != nil {
			a.Summary = *summary
		}
		articles = append(articles, a)
	}
	return articles, rows.Err()
}
