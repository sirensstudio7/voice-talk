// Package booking owns the Scheduling Engine: business hours and
// appointment slot calculation/booking. Owner-facing schedule and
// appointment-list endpoints require business membership; availability
// lookup and appointment creation are public (kiosk/voice-ordering
// facing), gated by internal/capabilities' booking_enabled — matching
// apps-legacy/server/src/routes/public.ts and services/appointments.ts.
package booking

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
	// Public, kiosk/voice-ordering facing.
	r.Get("/businesses/{slug}/availability", m.getAvailability)
	r.Post("/businesses/{slug}/appointments", m.createAppointment)

	// Owner-facing.
	r.Group(func(r chi.Router) {
		r.Use(authtoken.RequireAuth(m.deps.JWTSecret))
		r.Use(authz.RequireBusinessMember(m.store))

		r.Get("/businesses/{slug}/schedule", m.getSchedule)
		r.Put("/businesses/{slug}/schedule", m.putSchedule)
		r.Get("/businesses/{slug}/appointments", m.listAppointments)
		r.Patch("/businesses/{slug}/appointments/{id}/cancel", m.cancelAppointment)
	})
}
