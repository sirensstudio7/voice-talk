// Command api boots the Lorescale VoiceTalk backend: a single Go modular
// monolith serving REST and (eventually) WebSocket traffic for every
// domain module.
package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"

	"github.com/joho/godotenv"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/config"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/platform/cache"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/platform/database"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/platform/events"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/platform/httpserver"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/platform/logger"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/platform/meter"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/platform/storage"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/router"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

func main() {
	_ = godotenv.Load() // no-op if .env is absent, e.g. real deploys set env vars directly

	cfg, err := config.Load()
	if err != nil {
		panic(err) // logger isn't up yet; fine to panic pre-boot
	}
	log := logger.New(cfg.Env)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := database.NewPool(ctx, cfg)
	if err != nil {
		log.Fatal().Err(err).Msg("connect to database")
	}
	defer pool.Close()

	redisClient, err := cache.NewClient(ctx, cfg)
	if err != nil {
		log.Fatal().Err(err).Msg("connect to redis")
	}
	defer func() { _ = redisClient.Close() }()

	bus := events.NewBus()

	// R2 credentials are optional pre-launch (no module needed storage
	// until the presenter's file upload) — log and continue without it,
	// same fallback posture streaming.New already uses for a missing
	// GEMINI_API_KEY, rather than a hard boot failure.
	storageClient, err := storage.New(ctx, cfg)
	if err != nil {
		log.Warn().Err(err).Msg("object storage not configured — presenter file uploads will be unavailable")
	}

	usageMeter := meter.New(store.New(pool))

	handler := router.New(router.Deps{
		Config:  cfg,
		DB:      pool,
		Redis:   redisClient,
		Events:  bus,
		Log:     log,
		Storage: storageClient,
		Meter:   usageMeter,
	})

	if err := httpserver.Run(ctx, ":"+cfg.Port, handler, log); err != nil {
		log.Fatal().Err(err).Msg("server failed")
	}
}
