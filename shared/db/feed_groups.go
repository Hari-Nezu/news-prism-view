package db

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

type FeedGroup struct {
	ID           string
	Title        string
	ArticleCount int
	LastSeenAt   string
	CreatedAt    string
	Items        []FeedGroupItem
}

type FeedGroupItem struct {
	ID          string
	GroupID     string
	Title       string
	URL         string
	Source      string
	PublishedAt string
	MatchedAt   string
}

func GetFeedGroupsWithItems(ctx context.Context, pool *pgxpool.Pool) ([]FeedGroup, error) {
	rows, err := pool.Query(ctx, `
		SELECT id, title, article_count, last_seen_at::text, created_at::text
		FROM feed_groups
		ORDER BY last_seen_at DESC
		LIMIT 100`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var groups []FeedGroup
	for rows.Next() {
		var g FeedGroup
		err := rows.Scan(&g.ID, &g.Title, &g.ArticleCount, &g.LastSeenAt, &g.CreatedAt)
		if err != nil {
			return nil, err
		}

		itemRows, err := pool.Query(ctx, `
			SELECT id, group_id, title, url, source, COALESCE(published_at, ''), matched_at::text
			FROM feed_group_items
			WHERE group_id = $1`,
			g.ID,
		)
		if err != nil {
			return nil, err
		}
		for itemRows.Next() {
			var item FeedGroupItem
			err := itemRows.Scan(&item.ID, &item.GroupID, &item.Title, &item.URL, &item.Source, &item.PublishedAt, &item.MatchedAt)
			if err != nil {
				itemRows.Close()
				return nil, err
			}
			g.Items = append(g.Items, item)
		}
		itemRows.Close()

		groups = append(groups, g)
	}
	return groups, nil
}
