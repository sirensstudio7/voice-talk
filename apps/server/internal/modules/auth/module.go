// Package auth implements Auth & Multi-Tenancy: user signup/login (bcrypt
// + JWT), the RequireAuth middleware every protected route in this module
// uses, and workspace (business) creation/membership. TOTP and
// platform-admin auth are a separate, later concern
// (docs/ARCHITECTURE-MIGRATION-SPEC.md section 5) — this module is
// business-owner-facing only.
package auth

import (
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/platform/authtoken"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/platform/authz"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/platform/events"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/platform/storage"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

type Deps struct {
	DB             *pgxpool.Pool
	Redis          *redis.Client
	Events         *events.Bus
	Storage        *storage.Client // nil when R2 credentials aren't configured
	Log            zerolog.Logger
	JWTSecret      string
	JWTExpireHours int
}

type Module struct {
	deps  Deps
	store *store.Queries
}

func New(deps Deps) *Module {
	return &Module{deps: deps, store: store.New(deps.DB)}
}

func (m *Module) tokenTTL() time.Duration {
	hours := m.deps.JWTExpireHours
	if hours <= 0 {
		hours = 72
	}
	return time.Duration(hours) * time.Hour
}

func (m *Module) RegisterRoutes(r chi.Router) {
	r.Get("/businesses/{slug}", m.getBusinessBySlug)

	r.Post("/auth/signup", m.signup)
	r.Post("/auth/login", m.login)

	r.Group(func(r chi.Router) {
		r.Use(authtoken.RequireAuth(m.deps.JWTSecret))
		r.Get("/auth/me", m.getMe)
		r.Get("/businesses", m.listMyBusinesses)
		r.Post("/businesses", m.createBusiness)

		r.Group(func(r chi.Router) {
			r.Use(authz.RequireBusinessMember(m.store))
			r.Delete("/businesses/{slug}", m.deleteBusiness)
		})
	})
}
