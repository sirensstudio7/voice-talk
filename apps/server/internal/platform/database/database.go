// Package database manages the shared PostgreSQL connection pool.
package database

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/config"
)

// NewPool opens a pgxpool sized per the multi-tenant connection budget
// described in docs/TECHNICAL-ARCHITECTURE-SPEC.md: a small, strict pool
// (MaxConns/MinConns) with idle reclamation, since Aiven's free-tier
// Postgres caps total concurrent connections.
func NewPool(ctx context.Context, cfg *config.Config) (*pgxpool.Pool, error) {
	poolCfg, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		return nil, fmt.Errorf("database: parse config: %w", err)
	}

	poolCfg.MaxConns = cfg.DBMaxConns
	poolCfg.MinConns = cfg.DBMinConns
	poolCfg.MaxConnIdleTime = cfg.DBMaxConnIdle
	poolCfg.MaxConnLifetime = time.Hour

	connectCtx, cancel := context.WithTimeout(ctx, cfg.DBConnectTimeout)
	defer cancel()

	pool, err := pgxpool.NewWithConfig(connectCtx, poolCfg)
	if err != nil {
		return nil, fmt.Errorf("database: create pool: %w", err)
	}

	if err := pool.Ping(connectCtx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("database: ping: %w", err)
	}

	return pool, nil
}
