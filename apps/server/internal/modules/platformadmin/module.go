// Package platformadmin implements the Platform Admin surface named in
// docs/ARCHITECTURE-MIGRATION-SPEC.md §5 ("role-based access control...
// Platform Admin", "JWT & TOTP 2FA"): a cross-tenant staff panel entirely
// separate from customer auth (internal/modules/auth) — its own
// platform_admins table, its own mandatory-2FA login flow, its own RBAC.
// Named "platformadmin" rather than "platform" to avoid reading as the
// same thing as the internal/platform/* infrastructure directory, which
// it is not.
//
// Scope for this phase: dashboard metrics, user & business management
// (search/detail/status/reset-password/impersonate), tenant hard-delete
// (internal/tenantlifecycle), and an audit log every mutating action
// writes to. All addon/subscription/entitlement machinery from legacy is
// cut — this project ships free/unlimited pre-launch, see
// internal/modules/photomoment's Phase 1 plan for the same call made
// there. Demo-request intake and a generic settings key-value store are
// deferred to a Phase 2, same two-phase pattern used for
// streaming/presenter.
package platformadmin

import (
	"context"
	"errors"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/platform/storage"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

type Deps struct {
	DB                *pgxpool.Pool
	Storage           *storage.Client
	Log               zerolog.Logger
	JWTSecret         string
	SeedAdminEmail    string
	SeedAdminPassword string
	MerchantAdminURL  string
}

type Module struct {
	deps  Deps
	store *store.Queries
}

func New(deps Deps) *Module {
	m := &Module{deps: deps, store: store.New(deps.DB)}
	m.seedAdmin(context.Background())
	return m
}

// seedAdmin creates the first super-admin from env vars if no admin
// exists yet, matching internal/platform/storage's "warn and skip, never
// fail boot" posture when the seed vars are unset — same as R2
// credentials being optional pre-launch.
func (m *Module) seedAdmin(ctx context.Context) {
	count, err := m.store.CountPlatformAdmins(ctx)
	if err != nil {
		m.deps.Log.Error().Err(err).Msg("platformadmin: count admins for boot seed")
		return
	}
	if count > 0 {
		return
	}
	if m.deps.SeedAdminEmail == "" || m.deps.SeedAdminPassword == "" {
		m.deps.Log.Warn().Msg("platformadmin: no admins exist and PLATFORM_ADMIN_EMAIL/PLATFORM_ADMIN_PASSWORD are unset — the platform panel has no way to log in until an admin is created")
		return
	}

	hash, err := hashPassword(m.deps.SeedAdminPassword)
	if err != nil {
		m.deps.Log.Error().Err(err).Msg("platformadmin: hash seed admin password")
		return
	}
	if _, err := m.store.CreatePlatformAdmin(ctx, store.CreatePlatformAdminParams{
		ID: uuid.NewString(), Name: "Super Admin", Email: m.deps.SeedAdminEmail, PasswordHash: hash, Role: roleSuper,
	}); err != nil {
		if !isUniqueViolation(err) {
			m.deps.Log.Error().Err(err).Msg("platformadmin: create seed admin")
		}
		return
	}
	m.deps.Log.Info().Str("email", m.deps.SeedAdminEmail).Msg("platformadmin: seeded initial super admin — 2FA enrollment required on first login")
}

func (m *Module) RegisterRoutes(r chi.Router) {
	r.Post("/platform/auth/login", m.login)

	r.Group(func(r chi.Router) {
		r.Use(m.requirePendingAuth)
		r.Post("/platform/auth/setup-2fa", m.setup2FA)
		r.Post("/platform/auth/verify-2fa", m.verify2FA)
	})

	r.Group(func(r chi.Router) {
		r.Use(m.requirePlatformAuth)

		r.Get("/platform/auth/me", m.me)

		r.Group(func(r chi.Router) {
			r.Use(m.requirePermission(permDashboardRead))
			r.Get("/platform/dashboard", m.getDashboard)
		})

		r.Group(func(r chi.Router) {
			r.Use(m.requirePermission(permUsersRead))
			r.Get("/platform/users", m.listUsers)
			r.Get("/platform/users/{id}", m.getUser)
		})
		r.Group(func(r chi.Router) {
			r.Use(m.requirePermission(permUsersWrite))
			r.Patch("/platform/users/{id}/status", m.updateUserStatus)
			r.Post("/platform/users/{id}/reset-password", m.resetUserPassword)
		})

		r.Group(func(r chi.Router) {
			r.Use(m.requirePermission(permBusinessesRead))
			r.Get("/platform/businesses", m.listBusinesses)
			r.Get("/platform/businesses/{id}", m.getBusiness)
		})
		r.Group(func(r chi.Router) {
			r.Use(m.requirePermission(permBusinessesWrite))
			r.Patch("/platform/businesses/{id}/status", m.updateBusinessStatus)
			r.Delete("/platform/businesses/{id}", m.deleteBusiness)
		})
		r.Group(func(r chi.Router) {
			r.Use(m.requirePermission(permImpersonate))
			r.Post("/platform/businesses/{id}/impersonate", m.impersonateBusiness)
		})

		r.Group(func(r chi.Router) {
			r.Use(m.requirePermission(permAuditRead))
			r.Get("/platform/audit-logs", m.listAuditLogs)
		})
	})
}

// isUniqueViolation mirrors auth/handler_auth.go's and
// commerce/handler_products.go's identical helper — duplicated per-module
// since modules never import each other.
func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}
