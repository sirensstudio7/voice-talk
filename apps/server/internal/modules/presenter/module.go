// Package presenter owns the Slide Presenter Engine: deck-authoring
// (PPTX upload/parsing, the background parse-and-script pipeline, deck
// knowledge, session state/Q&A) plus the live interactive keynote
// WebSocket (live.go/handler_live.go), which narrates each slide's
// script through Gemini Live as the presenter advances — reusing the
// Live-API patterns from internal/modules/streaming/gemini_provider.go,
// simplified for a no-mic, no-tools, text-in/audio-out session. Batch
// TTS pre-synthesis (a WAV per slide, cached for offline playback) is
// deliberately not ported: presentation_audio_assets exists
// schema-only, and its legacy service functions
// (ensureSlideAudio/ensurePresentationStageAudio) are never actually
// called from any legacy route — dead code with no real behavior to
// port faithfully. Ported from
// apps-legacy/server/src/routes/{presentations,presentation-websocket}.ts
// and apps-legacy/server/src/services/{pptx-parser,
// presentation-knowledge,presentation-moderation,presentation-pipeline,
// presentation-session,presentation-ai,presenter-live}.ts.
package presenter

import (
	"context"
	"net/url"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog"
	"google.golang.org/genai"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/platform/authtoken"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/platform/authz"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/platform/events"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/platform/storage"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

type Deps struct {
	DB             *pgxpool.Pool
	Events         *events.Bus
	Storage        *storage.Client
	GeminiAPIKey   string
	GeminiModel    string
	AllowedOrigins []string
	Log            zerolog.Logger
	JWTSecret      string
}

type Module struct {
	deps           Deps
	store          *store.Queries
	genai          *genai.Client
	runner         *pipelineRunner
	live           presenterProvider
	originPatterns []string
}

func New(deps Deps) *Module {
	q := store.New(deps.DB)

	var client *genai.Client
	if deps.GeminiAPIKey != "" {
		c, err := genai.NewClient(context.Background(), &genai.ClientConfig{APIKey: deps.GeminiAPIKey})
		if err != nil {
			deps.Log.Error().Err(err).Msg("construct gemini client for presenter — Q&A answers will use the no-LLM fallback")
		} else {
			client = c
		}
	}

	var live presenterProvider = fakePresenterProvider{}
	if client != nil {
		live = &geminiPresenterProvider{client: client}
	}

	return &Module{
		deps:           deps,
		store:          q,
		genai:          client,
		runner:         newPipelineRunner(),
		live:           live,
		originPatterns: originPatternsFrom(deps.AllowedOrigins),
	}
}

// originPatternsFrom converts config.AllowedOrigins into
// coder/websocket's OriginPatterns (host-only globs, no scheme) —
// duplicated from streaming.originPatternsFrom since modules never
// import each other's internals.
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
	// Not behind authtoken.RequireAuth: a browser WebSocket can't set an
	// Authorization header, so handlePresenterLive verifies a ?token=
	// query param itself — see its doc comment.
	r.Get("/businesses/{slug}/presentations/{id}/sessions/{sessionId}/live", m.handlePresenterLive)

	r.Group(func(r chi.Router) {
		r.Use(authtoken.RequireAuth(m.deps.JWTSecret))
		r.Use(authz.RequireBusinessMember(m.store))

		r.Get("/businesses/{slug}/presentations", m.listPresentations)
		r.Post("/businesses/{slug}/presentations", m.createPresentation)
		r.Get("/businesses/{slug}/presentations/{id}", m.getPresentation)
		r.Patch("/businesses/{slug}/presentations/{id}", m.updatePresentation)
		r.Delete("/businesses/{slug}/presentations/{id}", m.deletePresentation)

		r.Get("/businesses/{slug}/presentations/{id}/knowledge", m.listPresentationKnowledge)
		r.Post("/businesses/{slug}/presentations/{id}/knowledge", m.createPresentationKnowledge)
		r.Patch("/businesses/{slug}/presentations/{id}/knowledge/{entryId}", m.updatePresentationKnowledge)
		r.Delete("/businesses/{slug}/presentations/{id}/knowledge/{entryId}", m.deletePresentationKnowledge)

		r.Post("/businesses/{slug}/presentations/{id}/files", m.uploadPresentationFile)
		r.Get("/businesses/{slug}/presentations/{id}/pptx", m.downloadPresentationPptx)

		r.Post("/businesses/{slug}/presentations/{id}/process", m.startProcessing)
		r.Post("/businesses/{slug}/presentations/{id}/process/cancel", m.cancelProcessingHandler)
		r.Post("/businesses/{slug}/presentations/{id}/regenerate-scripts", m.regenerateScripts)

		r.Post("/businesses/{slug}/presentations/{id}/sessions", m.createPresentationSession)
		r.Get("/businesses/{slug}/sessions", m.listPresentationSessions)
		r.Get("/businesses/{slug}/sessions/{sessionId}", m.getPresentationSession)
		r.Post("/businesses/{slug}/sessions/{sessionId}/control", m.controlPresentationSession)
		r.Post("/businesses/{slug}/sessions/{sessionId}/questions", m.submitPresentationQuestion)
		r.Get("/businesses/{slug}/sessions/{sessionId}/analytics", m.getSessionAnalytics)
		r.Patch("/businesses/{slug}/sessions/{sessionId}/audience-count", m.updateSessionAudienceCount)
	})
}
