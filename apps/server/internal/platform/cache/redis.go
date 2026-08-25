// Package cache manages the shared Redis client used for compiled AI
// prompt caching, rate limiting, and background job queues.
package cache

import (
	"context"
	"fmt"

	"github.com/redis/go-redis/v9"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/config"
)

// NewClient parses cfg.RedisURL (redis:// or rediss:// for TLS, as Upstash
// requires) and returns a connected client.
func NewClient(ctx context.Context, cfg *config.Config) (*redis.Client, error) {
	if cfg.RedisURL == "" {
		return nil, fmt.Errorf("cache: REDIS_URL is required")
	}

	opts, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		return nil, fmt.Errorf("cache: parse redis url: %w", err)
	}

	client := redis.NewClient(opts)

	if err := client.Ping(ctx).Err(); err != nil {
		_ = client.Close()
		return nil, fmt.Errorf("cache: ping: %w", err)
	}

	return client, nil
}
