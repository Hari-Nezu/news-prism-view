package db

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

const pipelineLockID = int64(8765432109)

func AcquirePipelineLock(ctx context.Context, pool *pgxpool.Pool) (bool, error) {
	var acquired bool
	err := pool.QueryRow(ctx, "SELECT pg_try_advisory_lock($1)", pipelineLockID).Scan(&acquired)
	return acquired, err
}

func ReleasePipelineLock(ctx context.Context, pool *pgxpool.Pool) {
	pool.Exec(ctx, "SELECT pg_advisory_unlock($1)", pipelineLockID)
}
