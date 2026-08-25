package knowledge

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/httpx"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

func (m *Module) listKnowledgeEntries(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())

	entries, err := m.store.ListKnowledgeEntries(r.Context(), access.BusinessID)
	if err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", access.BusinessID).Msg("list knowledge entries")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load knowledge entries")
		return
	}

	out := make([]knowledgeEntryOut, 0, len(entries))
	for _, e := range entries {
		out = append(out, toKnowledgeEntryOut(e))
	}
	httpx.List(w, http.StatusOK, out)
}

func (m *Module) createKnowledgeEntry(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())

	var req createKnowledgeEntryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "invalid request body")
		return
	}

	content := strings.TrimSpace(req.Content)
	if content == "" {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "content is required")
		return
	}
	category := strings.TrimSpace(req.Category)
	if category == "" {
		category = "General"
	}

	entry, err := m.store.CreateKnowledgeEntry(r.Context(), store.CreateKnowledgeEntryParams{
		ID:         uuid.NewString(),
		BusinessID: access.BusinessID,
		Category:   category,
		Title:      strings.TrimSpace(req.Title),
		Content:    content,
		SortOrder:  req.SortOrder,
	})
	if err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", access.BusinessID).Msg("create knowledge entry")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to create knowledge entry")
		return
	}

	httpx.JSON(w, http.StatusCreated, toKnowledgeEntryOut(entry))
}

func (m *Module) updateKnowledgeEntry(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())
	id := chi.URLParam(r, "id")

	var req updateKnowledgeEntryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "invalid request body")
		return
	}

	entry, err := m.store.UpdateKnowledgeEntry(r.Context(), store.UpdateKnowledgeEntryParams{
		ID:         id,
		BusinessID: access.BusinessID,
		Category:   textArg(req.Category),
		Title:      textArg(req.Title),
		Content:    textArg(req.Content),
		SortOrder:  int4Arg(req.SortOrder),
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "knowledge_entry_not_found", "knowledge entry not found")
			return
		}
		m.deps.Log.Error().Err(err).Str("entry_id", id).Msg("update knowledge entry")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to update knowledge entry")
		return
	}

	httpx.JSON(w, http.StatusOK, toKnowledgeEntryOut(entry))
}

func (m *Module) deleteKnowledgeEntry(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())
	id := chi.URLParam(r, "id")

	rowsAffected, err := m.store.DeleteKnowledgeEntry(r.Context(), store.DeleteKnowledgeEntryParams{
		ID:         id,
		BusinessID: access.BusinessID,
	})
	if err != nil {
		m.deps.Log.Error().Err(err).Str("entry_id", id).Msg("delete knowledge entry")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to delete knowledge entry")
		return
	}
	if rowsAffected == 0 {
		httpx.Error(w, http.StatusNotFound, "knowledge_entry_not_found", "knowledge entry not found")
		return
	}

	httpx.NoContent(w)
}

// deleteAllKnowledgeEntries wipes every knowledge entry for the business
// in one call — mirrors apps-legacy/server/src/routes/admin.ts's bulk
// DELETE /admin/businesses/:businessId/knowledge, used by the admin UI's
// "clear knowledge base" action.
func (m *Module) deleteAllKnowledgeEntries(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())

	if _, err := m.store.DeleteAllKnowledgeEntries(r.Context(), access.BusinessID); err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", access.BusinessID).Msg("delete all knowledge entries")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to delete knowledge entries")
		return
	}

	httpx.NoContent(w)
}
