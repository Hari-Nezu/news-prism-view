package db

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Snapshot struct {
	ID           string
	ProcessedAt  time.Time
	ArticleCount int
	GroupCount   int
	DurationMs   int
	Status       string
	Error        string
	Groups       []SnapshotGroup
}

type SnapshotGroup struct {
	ID           string
	SnapshotID   string
	GroupTitle   string
	Category     string
	Subcategory  string
	Rank         int
	SingleOutlet bool
	CoveredBy    []string
	SilentMedia  []string
	Items        []SnapshotGroupItem
}

type SnapshotGroupItem struct {
	ID          string
	GroupID     string
	Title       string
	URL         string
	Source      string
	Summary     string
	PublishedAt string
	Category    string
	Subcategory string
}

func SaveSnapshot(ctx context.Context, pool *pgxpool.Pool, snap Snapshot) (string, error) {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)

	var id string
	err = tx.QueryRow(ctx, `
		INSERT INTO processed_snapshots (article_count, group_count, duration_ms, status, error)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id`,
		snap.ArticleCount, snap.GroupCount, snap.DurationMs, snap.Status, nullStr(snap.Error),
	).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("insert snapshot: %w", err)
	}

	for i, g := range snap.Groups {
		coveredJSON, _ := json.Marshal(g.CoveredBy)
		silentJSON, _ := json.Marshal(g.SilentMedia)
		var gid string
		err = tx.QueryRow(ctx, `
			INSERT INTO snapshot_groups (snapshot_id, group_title, category, subcategory, rank, single_outlet, covered_by, silent_media)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			RETURNING id`,
			id, g.GroupTitle, nullStr(g.Category), nullStr(g.Subcategory),
			i+1, g.SingleOutlet, coveredJSON, silentJSON,
		).Scan(&gid)
		if err != nil {
			return "", fmt.Errorf("insert group %d: %w", i, err)
		}

		for _, item := range g.Items {
			_, err = tx.Exec(ctx, `
				INSERT INTO snapshot_group_items (group_id, title, url, source, summary, published_at, category, subcategory)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
				gid, item.Title, item.URL, item.Source,
				nullStr(item.Summary), nullStr(item.PublishedAt),
				nullStr(item.Category), nullStr(item.Subcategory),
			)
			if err != nil {
				return "", fmt.Errorf("insert item: %w", err)
			}
		}
	}

	// 7日以上前のスナップショットを削除
	tx.Exec(ctx, `DELETE FROM processed_snapshots WHERE processed_at < NOW() - INTERVAL '7 days'`)

	return id, tx.Commit(ctx)
}

func GetLatestSnapshot(ctx context.Context, pool *pgxpool.Pool) (*Snapshot, error) {
	var snap Snapshot
	err := pool.QueryRow(ctx, `
		SELECT id, processed_at, article_count, group_count, duration_ms, status, COALESCE(error,'')
		FROM processed_snapshots
		WHERE status != 'failed'
		ORDER BY processed_at DESC
		LIMIT 1`,
	).Scan(&snap.ID, &snap.ProcessedAt, &snap.ArticleCount, &snap.GroupCount, &snap.DurationMs, &snap.Status, &snap.Error)
	if err != nil {
		return nil, err
	}
	return &snap, nil
}
