package db

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

type CompareSession struct {
	ID      string
	Keyword string
}

func SaveCompareSession(ctx context.Context, pool *pgxpool.Pool, keyword string, groups any) (string, error) {
	groupsJSON, err := json.Marshal(groups)
	if err != nil {
		return "", fmt.Errorf("marshal groups: %w", err)
	}
	var id string
	err = pool.QueryRow(ctx,
		`INSERT INTO compare_sessions (keyword, groups_json) VALUES ($1, $2) RETURNING id`,
		keyword, groupsJSON).Scan(&id)
	return id, err
}
