// Package knowledge owns AI Rules & Knowledge RAG: owner-facing CRUD for
// assistant persona settings (ai_rules, a get-or-create singleton per
// business) and free-form knowledge base facts (knowledge_entries).
// Compiling these plus products into the structured system prompt a
// voice session is grounded in is the streaming module's job, once that
// module exists — see apps-legacy/server/src/services/config-builder.ts
// for the (large, tacit-knowledge-heavy) logic to port then.
package knowledge

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/platform/authtoken"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/platform/authz"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/platform/storage"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

type Deps struct {
	DB        *pgxpool.Pool
	Redis     *redis.Client
	Storage   *storage.Client // nil when R2 credentials aren't configured
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
	r.Route("/businesses/{slug}", func(r chi.Router) {
		r.Use(authtoken.RequireAuth(m.deps.JWTSecret))
		r.Use(authz.RequireBusinessMember(m.store))

		r.Get("/ai-rules", m.getAIRules)
		r.Patch("/ai-rules", m.updateAIRules)
		r.Post("/ai-rules/avatar", m.uploadAvatar)
		r.Delete("/ai-rules/avatar", m.deleteAvatar)
		r.Get("/prompt-preview", m.promptPreview)

		r.Route("/knowledge", func(r chi.Router) {
			r.Get("/", m.listKnowledgeEntries)
			r.Post("/", m.createKnowledgeEntry)
			r.Patch("/{id}", m.updateKnowledgeEntry)
			r.Delete("/{id}", m.deleteKnowledgeEntry)
			r.Delete("/", m.deleteAllKnowledgeEntries)
		})
	})
}
