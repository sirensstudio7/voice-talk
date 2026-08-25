// Package commerce owns Ordering & QRIS Checkout. Today that's owner-
// facing product (menu item) CRUD under /businesses/{slug}/products; live
// cart state during a voice session and payment verification are a later
// slice (docs/ARCHITECTURE-MIGRATION-SPEC.md section 6) — a voice-ordering
// session builds an order server-side via the streaming module's tool
// calls, not a standalone REST cart, so there's no "cart" endpoint here
// (see apps-legacy/server/src/services/order-persistence.ts).
package commerce

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/platform/authtoken"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/platform/authz"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/platform/events"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

type Deps struct {
	DB        *pgxpool.Pool
	Events    *events.Bus
	Log       zerolog.Logger
	JWTSecret string
}

type Module struct {
	deps  Deps
	store *store.Queries
}

func New(deps Deps) *Module {
	return &Module{deps: deps, store: store.New(deps.DB)}
}

func (m *Module) RegisterRoutes(r chi.Router) {
	r.Route("/businesses/{slug}/products", func(r chi.Router) {
		r.Use(authtoken.RequireAuth(m.deps.JWTSecret))
		r.Use(authz.RequireBusinessMember(m.store))

		r.Get("/", m.listProducts)
		r.Post("/", m.createProduct)
		r.Patch("/{id}", m.updateProduct)
		r.Delete("/{id}", m.deleteProduct)
	})
}
