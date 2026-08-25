package presenter

import (
	"context"
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

func (m *Module) listPresentationKnowledge(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if _, ok := m.requirePresentationAccess(w, r, id); !ok {
		return
	}

	rows, err := m.store.ListPresentationKnowledgeEntries(r.Context(), id)
	if err != nil {
		m.deps.Log.Error().Err(err).Str("presentation_id", id).Msg("list presentation knowledge")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load knowledge")
		return
	}

	out := make([]knowledgeOut, 0, len(rows))
	for _, k := range rows {
		out = append(out, toKnowledgeOut(k))
	}
	httpx.List(w, http.StatusOK, out)
}

func (m *Module) createPresentationKnowledge(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if _, ok := m.requirePresentationAccess(w, r, id); !ok {
		return
	}

	var req createKnowledgeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "invalid request body")
		return
	}
	content := strings.TrimSpace(req.Content)
	if content == "" {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "content is required")
		return
	}

	entry, err := m.store.CreatePresentationKnowledgeEntry(r.Context(), store.CreatePresentationKnowledgeEntryParams{
		ID: uuid.NewString(), PresentationID: id,
		Title: strings.TrimSpace(req.Title), Content: content, SortOrder: req.SortOrder,
	})
	if err != nil {
		m.deps.Log.Error().Err(err).Str("presentation_id", id).Msg("create presentation knowledge")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to create knowledge entry")
		return
	}

	m.syncKnowledgeEmbedding(r.Context(), id, entry)
	httpx.JSON(w, http.StatusCreated, toKnowledgeOut(entry))
}

func (m *Module) updatePresentationKnowledge(w http.ResponseWriter, r *http.Request) {
	presentationID := chi.URLParam(r, "id")
	entryID := chi.URLParam(r, "entryId")
	if _, ok := m.requirePresentationAccess(w, r, presentationID); !ok {
		return
	}

	var req updateKnowledgeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "invalid request body")
		return
	}

	entry, err := m.store.UpdatePresentationKnowledgeEntry(r.Context(), store.UpdatePresentationKnowledgeEntryParams{
		ID: entryID, PresentationID: presentationID,
		Title: textArg(req.Title), Content: textArg(req.Content), SortOrder: int4Arg(req.SortOrder),
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "knowledge_entry_not_found", "knowledge entry not found")
			return
		}
		m.deps.Log.Error().Err(err).Str("entry_id", entryID).Msg("update presentation knowledge")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to update knowledge entry")
		return
	}

	m.syncKnowledgeEmbedding(r.Context(), presentationID, entry)
	httpx.JSON(w, http.StatusOK, toKnowledgeOut(entry))
}

func (m *Module) deletePresentationKnowledge(w http.ResponseWriter, r *http.Request) {
	presentationID := chi.URLParam(r, "id")
	entryID := chi.URLParam(r, "entryId")
	if _, ok := m.requirePresentationAccess(w, r, presentationID); !ok {
		return
	}

	rowsAffected, err := m.store.DeletePresentationKnowledgeEntry(r.Context(), store.DeletePresentationKnowledgeEntryParams{
		ID: entryID, PresentationID: presentationID,
	})
	if err != nil {
		m.deps.Log.Error().Err(err).Str("entry_id", entryID).Msg("delete presentation knowledge")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to delete knowledge entry")
		return
	}
	if rowsAffected == 0 {
		httpx.Error(w, http.StatusNotFound, "knowledge_entry_not_found", "knowledge entry not found")
		return
	}

	if err := m.store.DeleteKnowledgeEmbeddings(r.Context(), store.DeleteKnowledgeEmbeddingsParams{
		PresentationID: presentationID, SourceID: pgTextValid(entryID),
	}); err != nil {
		m.deps.Log.Error().Err(err).Str("entry_id", entryID).Msg("delete knowledge embedding")
	}

	httpx.NoContent(w)
}

// syncKnowledgeEmbedding ports syncKnowledgeEmbedding from
// presentation-knowledge.ts: replaces the single embedding chunk for this
// knowledge entry (title+content), or removes it if now empty. Errors are
// logged, not surfaced — matches legacy's fire-and-forget indexing
// posture for knowledge writes.
func (m *Module) syncKnowledgeEmbedding(ctx context.Context, presentationID string, entry store.PresentationKnowledgeEntry) {
	if err := m.store.DeleteKnowledgeEmbeddings(ctx, store.DeleteKnowledgeEmbeddingsParams{
		PresentationID: presentationID, SourceID: pgTextValid(entry.ID),
	}); err != nil {
		m.deps.Log.Error().Err(err).Str("entry_id", entry.ID).Msg("sync knowledge embedding: delete existing")
		return
	}

	text := strings.TrimSpace(strings.Join([]string{entry.Title, entry.Content}, "\n\n"))
	if text == "" {
		return
	}

	if _, err := m.store.CreatePresentationEmbedding(ctx, store.CreatePresentationEmbeddingParams{
		ID: uuid.NewString(), PresentationID: presentationID, SourceType: "knowledge",
		SourceID: pgTextValid(entry.ID), ChunkText: text,
	}); err != nil {
		m.deps.Log.Error().Err(err).Str("entry_id", entry.ID).Msg("sync knowledge embedding: create")
	}
}
