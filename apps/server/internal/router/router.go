// Package router wires every domain module's HTTP routes onto the shared
// chi router. It is the one place in the monolith that knows about every
// module — individual modules never import each other.
package router

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/config"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/httpx"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/modules/auth"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/modules/booking"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/modules/commerce"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/modules/knowledge"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/modules/photomoment"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/modules/platformadmin"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/modules/presenter"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/modules/streaming"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/platform/events"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/platform/meter"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/platform/storage"
)

// Deps bundles the shared infrastructure every module is constructed
// with. Modules take only the slice of this they need.
type Deps struct {
	Config  *config.Config
	DB      *pgxpool.Pool
	Redis   *redis.Client
	Events  *events.Bus
	Log     zerolog.Logger
	Storage *storage.Client // nil when R2 credentials aren't configured — see cmd/api/main.go
	Meter   *meter.Meter
}

// Module is implemented by every domain package under internal/modules.
// RegisterRoutes attaches the module's endpoints to r under whatever path
// prefix the module owns.
type Module interface {
	RegisterRoutes(r chi.Router)
}

// New builds every domain module and mounts it on a chi router, plus the
// platform-level health check used by container orchestration.
func New(deps Deps) http.Handler {
	r := chi.NewRouter()

	// Note: chi's middleware.RealIP is deliberately not used here — it
	// trusts X-Forwarded-For/X-Real-IP unconditionally, which is spoofable
	// unless the trusted-proxy hop count is configured. Nothing in this
	// slice consumes client IP yet; add a trusted-proxy-aware resolver
	// when IP-based rate limiting (streaming module) needs it.
	r.Use(middleware.RequestID)
	r.Use(middleware.Recoverer)
	r.Use(requestLogger(deps.Log))
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   deps.Config.AllowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Content-Type", "Authorization"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	r.Get("/health", healthCheck(deps))

	modules := []Module{
		auth.New(auth.Deps{DB: deps.DB, Redis: deps.Redis, Events: deps.Events, Storage: deps.Storage, Log: deps.Log, JWTSecret: deps.Config.JWTSecret, JWTExpireHours: deps.Config.JWTExpireHours}),
		commerce.New(commerce.Deps{DB: deps.DB, Events: deps.Events, Log: deps.Log, JWTSecret: deps.Config.JWTSecret}),
		booking.New(booking.Deps{DB: deps.DB, Events: deps.Events, Log: deps.Log, JWTSecret: deps.Config.JWTSecret}),
		knowledge.New(knowledge.Deps{DB: deps.DB, Redis: deps.Redis, Log: deps.Log, JWTSecret: deps.Config.JWTSecret}),
		streaming.New(streaming.Deps{DB: deps.DB, Redis: deps.Redis, Events: deps.Events, Log: deps.Log, GeminiAPIKey: deps.Config.GeminiAPIKey, GeminiModel: deps.Config.GeminiModel, AllowedOrigins: deps.Config.AllowedOrigins}),
		presenter.New(presenter.Deps{DB: deps.DB, Events: deps.Events, Storage: deps.Storage, GeminiAPIKey: deps.Config.GeminiAPIKey, GeminiModel: deps.Config.GeminiModel, Log: deps.Log, JWTSecret: deps.Config.JWTSecret}),
		photomoment.New(photomoment.Deps{DB: deps.DB, Events: deps.Events, Storage: deps.Storage, Meter: deps.Meter, Log: deps.Log, JWTSecret: deps.Config.JWTSecret}),
		platformadmin.New(platformadmin.Deps{
			DB: deps.DB, Storage: deps.Storage, Log: deps.Log, JWTSecret: deps.Config.JWTSecret,
			SeedAdminEmail: deps.Config.PlatformAdminEmail, SeedAdminPassword: deps.Config.PlatformAdminPassword,
			MerchantAdminURL: deps.Config.MerchantAdminURL,
		}),
	}

	for _, m := range modules {
		m.RegisterRoutes(r)
	}

	return r
}

func healthCheck(deps Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, req *http.Request) {
		ctx := req.Context()

		status := map[string]string{"status": "ok"}
		code := http.StatusOK

		if err := deps.DB.Ping(ctx); err != nil {
			status["status"] = "degraded"
			status["db"] = "unreachable"
			code = http.StatusServiceUnavailable
		} else {
			status["db"] = "ok"
		}

		if deps.Redis != nil {
			if err := deps.Redis.Ping(ctx).Err(); err != nil {
				status["status"] = "degraded"
				status["redis"] = "unreachable"
				code = http.StatusServiceUnavailable
			} else {
				status["redis"] = "ok"
			}
		}

		httpx.JSON(w, code, status)
	}
}

// requestLogger logs method, path, status, and latency for every request
// via zerolog, since chi's built-in logger isn't zerolog-flavored.
func requestLogger(log zerolog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)

			next.ServeHTTP(ww, r)

			log.Info().
				Str("method", r.Method).
				Str("path", r.URL.Path).
				Int("status", ww.Status()).
				Dur("latency", time.Since(start)).
				Str("request_id", middleware.GetReqID(r.Context())).
				Msg("request")
		})
	}
}
