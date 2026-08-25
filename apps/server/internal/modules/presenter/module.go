// Package presenter owns the Slide Presenter Engine's deck-authoring
// surface: PPTX upload/parsing, the background parse-and-script pipeline,
// deck knowledge, and session state/Q&A. It implements
// docs/ARCHITECTURE-MIGRATION-SPEC.md §5's "Slide Presenter Engine" minus
// the live interactive keynote WebSocket and batch TTS audio synthesis —
// see the presenter Phase 1 plan for why that split, and
// internal/modules/streaming/gemini_provider.go for the Live-API patterns
// a later phase would reuse to add them. Ported from
// apps-legacy/server/src/routes/presentations.ts and
// apps-legacy/server/src/services/{pptx-parser,presentation-knowledge,
// presentation-moderation,presentation-pipeline,presentation-session,
// presentation-ai}.ts.
package presenter

import (
	"context"

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
	DB           *pgxpool.Pool
	Events       *events.Bus
	Storage      *storage.Client
	GeminiAPIKey string
	GeminiModel  string
	Log          zerolog.Logger
	JWTSecret    string
}

type Module struct {
	deps   Deps
	store  *store.Queries
	genai  *genai.Client
	runner *pipelineRunner
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

	return &Module{
		deps:   deps,
		store:  q,
		genai:  client,
		runner: newPipelineRunner(),
	}
}

func (m *Module) RegisterRoutes(r chi.Router) {
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
