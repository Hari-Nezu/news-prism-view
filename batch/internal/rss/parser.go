package rss

import (
	"context"
	"strings"
	"time"

	"github.com/mmcdole/gofeed"
	"github.com/newsprism/batch/internal/config"
	"github.com/newsprism/batch/internal/db"
)

// FetchFeed fetches a single RSS/Google News feed and returns articles.
func FetchFeed(ctx context.Context, feed config.FeedConfig) ([]db.Article, error) {
	fp := gofeed.NewParser()
	fp.UserAgent = "NewsPrismView/1.0"

	parsed, err := fp.ParseURLWithContext(feed.URL, ctx)
	if err != nil {
		return nil, err
	}

	isGoogleNews := feed.Type == "google-news"
	limit := 30
	if feed.FilterPolitical {
		limit = 20
	}

	var articles []db.Article
	for _, item := range parsed.Items {
		if len(articles) >= limit {
			break
		}

		title := strings.TrimSpace(item.Title)
		if title == "" {
			title = "タイトル不明"
		}

		summary := ""
		if item.Description != "" {
			summary = item.Description
		} else if item.Content != "" {
			summary = item.Content
		}

		url := item.Link
		if url == "" {
			continue
		}

		// Google News: extract source from <source> element
		source := feed.Name
		if isGoogleNews {
			if gnSource := extractGNSource(item); gnSource != "" {
				if feed.CanonicalSource != "" {
					source = feed.CanonicalSource
				} else {
					source = gnSource
				}
				// Strip " - 媒体名" suffix from title
				title = stripSourceSuffix(title, gnSource)
			}
		}

		if feed.FilterPolitical && !IsPolitical(title, summary) {
			continue
		}

		var pubAt *time.Time
		if item.PublishedParsed != nil {
			t := *item.PublishedParsed
			pubAt = &t
		} else if item.UpdatedParsed != nil {
			t := *item.UpdatedParsed
			pubAt = &t
		}

		imageURL := ""
		if item.Image != nil {
			imageURL = item.Image.URL
		}

		articles = append(articles, db.Article{
			URL:         url,
			Title:       title,
			Source:      source,
			Summary:     summary,
			ImageURL:    imageURL,
			PublishedAt: pubAt,
		})
	}
	return articles, nil
}

// extractGNSource extracts the source name from a Google News RSS item.
// Google News encodes the publisher in a <source> extension element.
func extractGNSource(item *gofeed.Item) string {
	// gofeed stores unknown elements in Extensions map
	// Google News uses namespace "source" or puts it in the default namespace
	for ns, exts := range item.Extensions {
		_ = ns
		for name, vals := range exts {
			if name == "source" || name == "name" {
				for _, v := range vals {
					if v.Value != "" {
						return strings.TrimSpace(v.Value)
					}
				}
			}
		}
	}
	// Fallback: parse from title suffix " - Publisher"
	return ""
}

// stripSourceSuffix removes " - SourceName" from the end of a Google News title.
func stripSourceSuffix(title, source string) string {
	suffix := " - " + source
	if strings.HasSuffix(title, suffix) {
		return strings.TrimSuffix(title, suffix)
	}
	// Also try trimming the last " - X" segment regardless of exact source name
	if idx := strings.LastIndex(title, " - "); idx > 0 {
		candidate := title[:idx]
		if len(candidate) > 5 {
			return candidate
		}
	}
	return title
}
