// Package streaming owns the Realtime Voice Streamer — the voice-session
// WebSocket bridge. It implements the client<->server protocol, session
// lifecycle, DB persistence, and the tool-calling execution loop against
// either a real Gemini Live connection (GeminiProvider, when
// GEMINI_API_KEY is configured) or a FakeProvider standing in for one
// (every DB-gated test, and any deployment without a key). See the
// streaming Phase 2 plan for the Provider/ProviderSession design and why
// booking-mode tools now reuse internal/scheduling instead of being
// stubbed.
package streaming

import (
	"context"
	"net/url"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/platform/authtoken"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/platform/authz"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/platform/events"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

type Deps struct {
	DB             *pgxpool.Pool
	Redis          *redis.Client
	Events         *events.Bus
	Log            zerolog.Logger
	GeminiAPIKey   string
	GeminiModel    string
	AllowedOrigins []string
	JWTSecret      string
}

type Module struct {
	deps           Deps
	store          *store.Queries
	tools          *ToolExecutor
	provider       Provider
	originPatterns []string
}

func New(deps Deps) *Module {
	q := store.New(deps.DB)

	var provider Provider = FakeProvider{}
	if deps.GeminiAPIKey != "" {
		gp, err := NewGeminiProvider(context.Background(), deps.GeminiAPIKey, deps.GeminiModel, q)
		if err != nil {
			deps.Log.Error().Err(err).Msg("construct gemini provider — falling back to fake provider")
		} else {
			provider = gp
		}
	}

	return &Module{
		deps:           deps,
		store:          q,
		tools:          NewToolExecutor(q, deps.Events),
		provider:       provider,
		originPatterns: originPatternsFrom(deps.AllowedOrigins),
	}
}

// originPatternsFrom converts config.AllowedOrigins ("http://localhost:6670",
// "https://kiosk.lorescale.com", ...) into coder/websocket's OriginPatterns
// (host-only globs, no scheme) — without this, every WebSocket handshake
// from a real browser origin is rejected by default.
func originPatternsFrom(origins []string) []string {
	patterns := make([]string, 0, len(origins))
	for _, o := range origins {
		if u, err := url.Parse(o); err == nil && u.Host != "" {
			patterns = append(patterns, u.Host)
		} else {
			patterns = append(patterns, strings.TrimPrefix(strings.TrimPrefix(o, "https://"), "http://"))
		}
	}
	return patterns
}

func (m *Module) RegisterRoutes(r chi.Router) {
	r.Get("/businesses/{slug}/voice-session", m.handleVoiceSession)

	r.Group(func(r chi.Router) {
		r.Use(authtoken.RequireAuth(m.deps.JWTSecret))
		r.Use(authz.RequireBusinessMember(m.store))

		r.Get("/businesses/{slug}/conversations", m.listConversations)
		r.Get("/businesses/{slug}/conversations/export", m.exportConversations)
		r.Get("/businesses/{slug}/conversations/{sessionId}", m.getConversation)

		r.Get("/businesses/{slug}/stats/summary", m.getStatsSummary)
		r.Get("/businesses/{slug}/stats/overview", m.getStatsOverview)
		r.Get("/businesses/{slug}/stats/daily", m.getStatsDaily)
		r.Get("/businesses/{slug}/stats/top-products", m.getStatsTopProducts)
	})
}
