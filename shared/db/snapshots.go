package db

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Snapshot struct {
	ID           string          `json:"id"`
	ProcessedAt  time.Time       `json:"processedAt"`
	ArticleCount int             `json:"articleCount"`
	GroupCount   int             `json:"groupCount"`
	DurationMs   int             `json:"durationMs"`
	Status       string          `json:"status"`
	Error        string          `json:"error"`
	Groups       []SnapshotGroup `json:"groups"`
}

type SnapshotGroup struct {
	ID           string              `json:"id"`
	SnapshotID   string              `json:"snapshotId"`
	GroupTitle   string              `json:"groupTitle"`
	Category     string              `json:"category"`
	Subcategory  string              `json:"subcategory"`
	Rank         int                 `json:"rank"`
	SingleOutlet bool                `json:"singleOutlet"`
	CoveredBy    []string            `json:"coveredBy"`
	SilentMedia  []string            `json:"silentMedia"`
	Items        []SnapshotGroupItem `json:"items"`
}

type SnapshotGroupItem struct {
	ID          string `json:"id"`
	GroupID     string `json:"groupId"`
	Title       string `json:"title"`
	URL         string `json:"url"`
	Source      string `json:"source"`
	Summary     string `json:"summary"`
	PublishedAt string `json:"publishedAt"`
	Category    string `json:"category"`
	Subcategory string `json:"subcategory"`
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

func GetLatestSnapshotWithGroups(ctx context.Context, pool *pgxpool.Pool) (*Snapshot, error) {
	snap, err := GetLatestSnapshot(ctx, pool)
	if err != nil {
		return nil, err
	}

	rows, err := pool.Query(ctx, `
		SELECT id, group_title, COALESCE(category,''), COALESCE(subcategory,''), rank, single_outlet, covered_by, silent_media
		FROM snapshot_groups
		WHERE snapshot_id = $1
		ORDER BY rank ASC`,
		snap.ID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	groupIDs := make([]string, 0)
	groupIndexMap := make(map[string]int) // groupID → snap.Groups のインデックス
	for rows.Next() {
		var g SnapshotGroup
		var coveredJSON, silentJSON []byte
		err := rows.Scan(&g.ID, &g.GroupTitle, &g.Category, &g.Subcategory, &g.Rank, &g.SingleOutlet, &coveredJSON, &silentJSON)
		if err != nil {
			return nil, err
		}
		if err := json.Unmarshal(coveredJSON, &g.CoveredBy); err != nil {
			return nil, fmt.Errorf("unmarshal covered_by: %w", err)
		}
		if err := json.Unmarshal(silentJSON, &g.SilentMedia); err != nil {
			return nil, fmt.Errorf("unmarshal silent_media: %w", err)
		}
		groupIndexMap[g.ID] = len(snap.Groups)
		groupIDs = append(groupIDs, g.ID)
		snap.Groups = append(snap.Groups, g)
	}

	if len(groupIDs) > 0 {
		itemRows, err := pool.Query(ctx, `
			SELECT id, group_id, title, url, source, COALESCE(summary,''), COALESCE(published_at,''), COALESCE(category,''), COALESCE(subcategory,'')
			FROM snapshot_group_items
			WHERE group_id = ANY($1)`,
			groupIDs,
		)
		if err != nil {
			return nil, err
		}
		defer itemRows.Close()

		for itemRows.Next() {
			var item SnapshotGroupItem
			var groupID string
			err := itemRows.Scan(&item.ID, &groupID, &item.Title, &item.URL, &item.Source, &item.Summary, &item.PublishedAt, &item.Category, &item.Subcategory)
			if err != nil {
				return nil, err
			}
			if idx, ok := groupIndexMap[groupID]; ok {
				snap.Groups[idx].Items = append(snap.Groups[idx].Items, item)
			}
		}
	}

	return snap, nil
}

// UpdateSnapshotGroupTitles updates group_title for each groupID in the map.
func UpdateSnapshotGroupTitles(ctx context.Context, pool *pgxpool.Pool, updates map[string]string) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	for groupID, title := range updates {
		if _, err := tx.Exec(ctx,
			`UPDATE snapshot_groups SET group_title = $1 WHERE id = $2`,
			title, groupID,
		); err != nil {
			return fmt.Errorf("update group %s: %w", groupID, err)
		}
	}
	return tx.Commit(ctx)
}

func GetSnapshotHistory(ctx context.Context, pool *pgxpool.Pool) ([]Snapshot, error) {
	rows, err := pool.Query(ctx, `
		SELECT id, processed_at, article_count, group_count, duration_ms, status, COALESCE(error,'')
		FROM processed_snapshots
		ORDER BY processed_at DESC
		LIMIT 20`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var history []Snapshot
	for rows.Next() {
		var snap Snapshot
		err := rows.Scan(&snap.ID, &snap.ProcessedAt, &snap.ArticleCount, &snap.GroupCount, &snap.DurationMs, &snap.Status, &snap.Error)
		if err != nil {
			return nil, err
		}
		history = append(history, snap)
	}
	return history, nil
}

type GroupInspectArticle struct {
	Title       string  `json:"title"`
	URL         string  `json:"url"`
	Source      string  `json:"source"`
	PublishedAt *string `json:"publishedAt"`
	Category    *string `json:"category"`
	Subcategory *string `json:"subcategory"`
	Summary     *string `json:"summary"`
}

type GroupIssue struct {
	Type     string `json:"type"`
	Severity string `json:"severity"`
	Message  string `json:"message"`
}

type GroupInspectSummary struct {
	TotalArticles int            `json:"totalArticles"`
	ByCategory    map[string]int `json:"byCategory"`
	Issues        []GroupIssue   `json:"issues"`
}

type GroupInspectDetail struct {
	SnapshotID   string               `json:"snapshotId"`
	GroupID      string               `json:"groupId"`
	GroupTitle   string               `json:"groupTitle"`
	Category     *string              `json:"category"`
	Subcategory  *string              `json:"subcategory"`
	Rank         int                  `json:"rank"`
	SingleOutlet bool                 `json:"singleOutlet"`
	CoveredBy    []string             `json:"coveredBy"`
	SilentMedia  []string             `json:"silentMedia"`
	Articles     []GroupInspectArticle `json:"articles"`
	Summary      GroupInspectSummary  `json:"summary"`
}

func GetSnapshotGroupDetail(ctx context.Context, pool *pgxpool.Pool, groupID string) (*GroupInspectDetail, error) {
	var d GroupInspectDetail
	var coveredJSON, silentJSON []byte
	err := pool.QueryRow(ctx, `
		SELECT id, snapshot_id, group_title, category, subcategory, rank, single_outlet, covered_by, silent_media
		FROM snapshot_groups
		WHERE id = $1`,
		groupID,
	).Scan(&d.GroupID, &d.SnapshotID, &d.GroupTitle, &d.Category, &d.Subcategory, &d.Rank, &d.SingleOutlet, &coveredJSON, &silentJSON)
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal(coveredJSON, &d.CoveredBy); err != nil {
		return nil, fmt.Errorf("unmarshal covered_by: %w", err)
	}
	if err := json.Unmarshal(silentJSON, &d.SilentMedia); err != nil {
		return nil, fmt.Errorf("unmarshal silent_media: %w", err)
	}

	itemRows, err := pool.Query(ctx, `
		SELECT title, url, source, summary, published_at, category, subcategory
		FROM snapshot_group_items
		WHERE group_id = $1`,
		d.GroupID,
	)
	if err != nil {
		return nil, err
	}
	defer itemRows.Close()

	byCategory := map[string]int{}
	for itemRows.Next() {
		var a GroupInspectArticle
		if err := itemRows.Scan(&a.Title, &a.URL, &a.Source, &a.Summary, &a.PublishedAt, &a.Category, &a.Subcategory); err != nil {
			return nil, err
		}
		if a.Category != nil {
			byCategory[*a.Category]++
		}
		d.Articles = append(d.Articles, a)
	}

	d.Summary = GroupInspectSummary{
		TotalArticles: len(d.Articles),
		ByCategory:    byCategory,
		Issues:        []GroupIssue{},
	}

	return &d, nil
}

// --- Recompute ---

type RecomputeNeighbor struct {
	URL        string  `json:"url"`
	Title      string  `json:"title"`
	Source     string  `json:"source"`
	GroupID    string  `json:"groupId"`
	GroupTitle string  `json:"groupTitle"`
	Similarity float64 `json:"similarity"`
}

type RecomputeAlternativeCluster struct {
	GroupID    string  `json:"groupId"`
	GroupTitle string  `json:"groupTitle"`
	Category   *string `json:"category"`
	Similarity float64 `json:"similarity"`
}

type RecomputeArticleResult struct {
	URL                     string                        `json:"url"`
	Title                   string                        `json:"title"`
	Source                  string                        `json:"source"`
	Category                *string                       `json:"category"`
	HasEmbedding            bool                          `json:"hasEmbedding"`
	IsUnknownCategory       bool                          `json:"isUnknownCategory"`
	SimilarityToCentroid    *float64                      `json:"similarityToCentroid"`
	SimilarityBeforePenalty *float64                      `json:"similarityBeforePenalty"`
	SimilarityAfterPenalty  *float64                      `json:"similarityAfterPenalty"`
	WouldJoinAtThreshold    *bool                         `json:"wouldJoinAtThreshold"`
	NearestNeighbors        []RecomputeNeighbor           `json:"nearestNeighbors"`
	AlternativeClusters     []RecomputeAlternativeCluster `json:"alternativeClusters"`
}

type ThresholdSimulation struct {
	Threshold   float64 `json:"threshold"`
	WouldStay   int     `json:"wouldStay"`
	WouldLeave  int     `json:"wouldLeave"`
	NoEmbedding int     `json:"noEmbedding"`
}

type RecomputeResult struct {
	SnapshotID          string                   `json:"snapshotId"`
	GroupID             string                   `json:"groupId"`
	GroupTitle          string                   `json:"groupTitle"`
	GroupCategory       *string                  `json:"groupCategory"`
	HasCentroid         bool                     `json:"hasCentroid"`
	Articles            []RecomputeArticleResult `json:"articles"`
	ThresholdSimulation ThresholdSimulation      `json:"thresholdSimulation"`
}

func RecomputeGroupInspect(ctx context.Context, pool *pgxpool.Pool, snapshotID, groupID string, threshold float64) (*RecomputeResult, error) {
	detail, err := GetSnapshotGroupDetail(ctx, pool, groupID)
	if err != nil {
		return nil, fmt.Errorf("get group: %w", err)
	}

	// Collect URLs
	urls := make([]string, len(detail.Articles))
	for i, a := range detail.Articles {
		urls[i] = a.URL
	}

	// Get embeddings
	embedMap, err := GetEmbeddingsByURLs(ctx, pool, urls)
	if err != nil {
		return nil, fmt.Errorf("get embeddings: %w", err)
	}

	// Compute centroid
	var vecs [][]float32
	for _, url := range urls {
		if emb, ok := embedMap[url]; ok {
			vecs = append(vecs, emb)
		}
	}
	centroid := MeanVector(vecs)

	result := &RecomputeResult{
		SnapshotID:    detail.SnapshotID,
		GroupID:       detail.GroupID,
		GroupTitle:    detail.GroupTitle,
		GroupCategory: detail.Category,
		HasCentroid:   len(centroid) > 0,
	}

	sim := ThresholdSimulation{Threshold: threshold}

	for _, a := range detail.Articles {
		ar := RecomputeArticleResult{
			URL:                 a.URL,
			Title:               a.Title,
			Source:              a.Source,
			Category:            a.Category,
			IsUnknownCategory:   a.Category == nil || *a.Category == "" || *a.Category == "other",
			NearestNeighbors:    []RecomputeNeighbor{},
			AlternativeClusters: []RecomputeAlternativeCluster{},
		}

		emb, hasEmb := embedMap[a.URL]
		ar.HasEmbedding = hasEmb

		if hasEmb && len(centroid) > 0 {
			raw := float64(CosineSimilarity(emb, centroid))
			ar.SimilarityBeforePenalty = &raw

			// Category gate: match grouper.groupGreedy behavior (skip if category differs)
			penalized := raw
			if detail.Category != nil && a.Category != nil && *a.Category != "" && *detail.Category != "" && *a.Category != *detail.Category {
				penalized = 0
			}
			ar.SimilarityAfterPenalty = &penalized
			ar.SimilarityToCentroid = &penalized

			joins := penalized > threshold
			ar.WouldJoinAtThreshold = &joins
			if joins {
				sim.WouldStay++
			} else {
				sim.WouldLeave++
			}

			// Nearest neighbors
			neighbors, _ := FindSimilarArticlesWithGroup(ctx, pool, emb, a.URL, 5, snapshotID)
			for _, n := range neighbors {
				nb := RecomputeNeighbor{
					URL:        n.URL,
					Title:      n.Title,
					Source:     n.Source,
					Similarity: float64(n.Similarity),
				}
				if n.GroupID != nil {
					nb.GroupID = *n.GroupID
				}
				if n.GroupTitle != nil {
					nb.GroupTitle = *n.GroupTitle
				}
				ar.NearestNeighbors = append(ar.NearestNeighbors, nb)
			}

			// Alternative clusters from neighbors (exclude current group)
			seen := map[string]bool{}
			for _, n := range neighbors {
				if n.GroupID == nil || *n.GroupID == groupID || seen[*n.GroupID] {
					continue
				}
				seen[*n.GroupID] = true
				ac := RecomputeAlternativeCluster{
					GroupID:    *n.GroupID,
					Similarity: float64(n.Similarity),
				}
				if n.GroupTitle != nil {
					ac.GroupTitle = *n.GroupTitle
				}
				ar.AlternativeClusters = append(ar.AlternativeClusters, ac)
			}
		} else {
			sim.NoEmbedding++
		}

		result.Articles = append(result.Articles, ar)
	}

	result.ThresholdSimulation = sim
	return result, nil
}
