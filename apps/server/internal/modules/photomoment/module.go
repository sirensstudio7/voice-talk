// Package photomoment owns Smart Photo Moment: a per-business,
// owner-toggleable post-transaction selfie flow — guest starts a session,
// uploads one selfie, the server composites branding (frame/logo/campaign
// text) onto it server-side, and hands back an expiring QR/download link.
// Ported from apps-legacy/server/src/routes/photo-moment.ts and
// services/photo-jobs.ts, with two scope cuts made explicit in the Phase 1
// plan: no addon-subscription/entitlement gating (ships free/unlimited,
// gated only by the owner's own photo_settings.enabled — see
// docs/*-SPEC.md's pre-launch free-tier stance) and no coupling into
// internal/modules/streaming's voice pipeline (deferred to a later phase).
//
// Two deliberate improvements over legacy, also called out in the plan:
// QR codes are generated server-side (legacy sent each guest's private
// download URL to an unauthenticated third-party API) and the
// photo_downloaded/qr_scanned usage events fire only on a download link's
// first resolution, not every repeat view.
package photomoment

import (
	"context"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/platform/authtoken"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/platform/authz"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/platform/events"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/platform/meter"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/platform/storage"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

type Deps struct {
	DB        *pgxpool.Pool
	Events    *events.Bus
	Storage   *storage.Client
	Meter     *meter.Meter
	Log       zerolog.Logger
	JWTSecret string
}

type Module struct {
	deps  Deps
	store *store.Queries
}

func New(deps Deps) *Module {
	m := &Module{deps: deps, store: store.New(deps.DB)}
	go m.runCleanupLoop(context.Background())
	return m
}

func (m *Module) RegisterRoutes(r chi.Router) {
	// Public, kiosk/voice-ordering facing — no auth, business resolved by
	// {slug} the same way booking's public endpoints do.
	r.Get("/businesses/{slug}/photo/config", m.getPublicPhotoConfig)
	r.Post("/businesses/{slug}/photo-sessions", m.startPhotoSession)
	r.Post("/businesses/{slug}/photo-sessions/{id}/response", m.setSessionResponse)
	r.Post("/businesses/{slug}/photo-sessions/{id}/upload", m.uploadPhoto)
	r.Post("/businesses/{slug}/photo-sessions/{id}/complete", m.completeSession)

	r.Get("/photo-downloads/{token}", m.resolveDownload)
	r.Get("/photo-downloads/{token}/qr.png", m.downloadQR)

	// Owner-facing.
	r.Group(func(r chi.Router) {
		r.Use(authtoken.RequireAuth(m.deps.JWTSecret))
		r.Use(authz.RequireBusinessMember(m.store))

		r.Get("/businesses/{slug}/photo/settings", m.getSettings)
		r.Patch("/businesses/{slug}/photo/settings", m.updateSettings)
		r.Post("/businesses/{slug}/photo/branding/{kind}", m.uploadBranding)
		r.Delete("/businesses/{slug}/photo/branding/{kind}", m.deleteBranding)

		r.Get("/businesses/{slug}/photo/gallery", m.listGallery)
		r.Delete("/businesses/{slug}/photo/gallery/{sessionId}", m.deleteGalleryItem)
		r.Get("/businesses/{slug}/photo/analytics", m.getAnalytics)
	})
}

const qrExpiryDefaultHours = 24

// Session status lifecycle: started -> accepted|declined -> captured -> completed.
// A declined session terminates at "declined" and never uploads a photo.
const (
	sessionStarted   = "started"
	sessionAccepted  = "accepted"
	sessionDeclined  = "declined"
	sessionCaptured  = "captured"
	sessionCompleted = "completed"
	sessionExpired   = "expired"
)

// Usage event types recorded via internal/platform/meter — this module is
// the first real call site for that package (see its doc comment).
const (
	eventPhotoSessionStarted = "photomoment.session_started"
	eventPhotoAccepted       = "photomoment.accepted"
	eventPhotoDeclined       = "photomoment.declined"
	eventPhotoDownloaded     = "photomoment.downloaded"
)
