package presenter

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/httpx"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

// requirePresentationAccess loads the presentation scoped by the caller's
// verified business membership, writing 404 itself if it doesn't exist or
// belongs to a different business — every handler that takes a
// presentation id from the URL path must call this before touching any
// data scoped to it, since chi.URLParam is caller-controlled and business
// membership alone (checked by authz.RequireBusinessMember) doesn't imply
// the presentation belongs to that business.
func (m *Module) requirePresentationAccess(w http.ResponseWriter, r *http.Request, id string) (store.Presentation, bool) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())
	p, err := m.store.GetPresentation(r.Context(), store.GetPresentationParams{ID: id, BusinessID: access.BusinessID})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "presentation_not_found", "presentation not found")
			return store.Presentation{}, false
		}
		m.deps.Log.Error().Err(err).Str("presentation_id", id).Msg("get presentation")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load presentation")
		return store.Presentation{}, false
	}
	return p, true
}

func (m *Module) listPresentations(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())

	rows, err := m.store.ListPresentationsForBusiness(r.Context(), access.BusinessID)
	if err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", access.BusinessID).Msg("list presentations")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load presentations")
		return
	}

	out := make([]presentationOut, 0, len(rows))
	for _, p := range rows {
		out = append(out, toPresentationOut(p))
	}
	httpx.List(w, http.StatusOK, out)
}

func (m *Module) createPresentation(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())
	userID, _ := httpx.UserIDFromContext(r.Context())

	var req createPresentationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "invalid request body")
		return
	}
	title := strings.TrimSpace(req.Title)
	if title == "" {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "title is required")
		return
	}
	language := req.Language
	if language == "" {
		language = "en"
	}

	p, err := m.store.CreatePresentation(r.Context(), store.CreatePresentationParams{
		ID: uuid.NewString(), BusinessID: access.BusinessID,
		CreatedBy:   pgtype.Text{String: userID, Valid: userID != ""},
		Title:       title,
		Description: req.Description,
		Language:    language,
		Category:    req.Category,
	})
	if err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", access.BusinessID).Msg("create presentation")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to create presentation")
		return
	}

	httpx.JSON(w, http.StatusCreated, toPresentationOut(p))
}

func (m *Module) getPresentation(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())
	id := chi.URLParam(r, "id")

	p, err := m.store.GetPresentation(r.Context(), store.GetPresentationParams{ID: id, BusinessID: access.BusinessID})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "presentation_not_found", "presentation not found")
			return
		}
		m.deps.Log.Error().Err(err).Str("presentation_id", id).Msg("get presentation")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load presentation")
		return
	}

	files, err := m.store.ListPresentationFiles(r.Context(), id)
	if err != nil {
		m.deps.Log.Error().Err(err).Str("presentation_id", id).Msg("list presentation files")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load presentation")
		return
	}
	slides, err := m.store.ListPresentationSlides(r.Context(), id)
	if err != nil {
		m.deps.Log.Error().Err(err).Str("presentation_id", id).Msg("list presentation slides")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load presentation")
		return
	}
	knowledge, err := m.store.ListPresentationKnowledgeEntries(r.Context(), id)
	if err != nil {
		m.deps.Log.Error().Err(err).Str("presentation_id", id).Msg("list presentation knowledge")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load presentation")
		return
	}

	var pptxURL *string
	for _, f := range files {
		if f.FileType == "pptx" {
			path := f.StoragePath
			pptxURL = &path
			break
		}
	}

	fileOuts := make([]fileOut, 0, len(files))
	for _, f := range files {
		fileOuts = append(fileOuts, toFileOut(f))
	}
	slideOuts := make([]slideOut, 0, len(slides))
	for _, s := range slides {
		slideOuts = append(slideOuts, toSlideOut(s))
	}
	knowledgeOuts := make([]knowledgeOut, 0, len(knowledge))
	for _, k := range knowledge {
		knowledgeOuts = append(knowledgeOuts, toKnowledgeOut(k))
	}

	httpx.JSON(w, http.StatusOK, presentationDetailOut{
		presentationOut: toPresentationOut(p),
		Files:           fileOuts,
		Slides:          slideOuts,
		Knowledge:       knowledgeOuts,
		PptxURL:         pptxURL,
	})
}

func (m *Module) updatePresentation(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())
	id := chi.URLParam(r, "id")

	var req updatePresentationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "invalid request body")
		return
	}

	p, err := m.store.UpdatePresentationDetails(r.Context(), store.UpdatePresentationDetailsParams{
		ID: id, BusinessID: access.BusinessID,
		Title:       textArg(req.Title),
		Description: textArg(req.Description),
		Language:    textArg(req.Language),
		Category:    textArg(req.Category),
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "presentation_not_found", "presentation not found")
			return
		}
		m.deps.Log.Error().Err(err).Str("presentation_id", id).Msg("update presentation")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to update presentation")
		return
	}

	httpx.JSON(w, http.StatusOK, toPresentationOut(p))
}

func (m *Module) deletePresentation(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())
	id := chi.URLParam(r, "id")

	rowsAffected, err := m.store.SoftDeletePresentation(r.Context(), store.SoftDeletePresentationParams{ID: id, BusinessID: access.BusinessID})
	if err != nil {
		m.deps.Log.Error().Err(err).Str("presentation_id", id).Msg("delete presentation")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to delete presentation")
		return
	}
	if rowsAffected == 0 {
		httpx.Error(w, http.StatusNotFound, "presentation_not_found", "presentation not found")
		return
	}

	httpx.NoContent(w)
}

func (m *Module) startProcessing(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())
	id := chi.URLParam(r, "id")
	// Ownership must be confirmed before enqueueProcessing: it's called
	// with force=true below, which cancels any already-running pipeline
	// for this id regardless of which business owns it — SetPresentationStatus
	// alone doesn't guard this, since it's an :exec query that silently
	// writes zero rows on a business_id mismatch rather than erroring.
	if _, ok := m.requirePresentationAccess(w, r, id); !ok {
		return
	}

	files, err := m.store.ListPresentationFiles(r.Context(), id)
	if err != nil {
		m.deps.Log.Error().Err(err).Str("presentation_id", id).Msg("list presentation files")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to start processing")
		return
	}
	if len(files) == 0 {
		httpx.Error(w, http.StatusBadRequest, "no_file_uploaded", "upload a file before processing")
		return
	}

	if err := m.store.SetPresentationStatus(r.Context(), store.SetPresentationStatusParams{
		ID: id, BusinessID: access.BusinessID, Status: "processing", ProcessingStep: "parsing",
	}); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "presentation_not_found", "presentation not found")
			return
		}
		m.deps.Log.Error().Err(err).Str("presentation_id", id).Msg("set presentation processing status")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to start processing")
		return
	}

	m.enqueueProcessing(id, access.BusinessID, true)

	p, err := m.store.GetPresentation(r.Context(), store.GetPresentationParams{ID: id, BusinessID: access.BusinessID})
	if err != nil {
		m.deps.Log.Error().Err(err).Str("presentation_id", id).Msg("get presentation after enqueue")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to start processing")
		return
	}
	httpx.JSON(w, http.StatusOK, toPresentationOut(p))
}

func (m *Module) cancelProcessingHandler(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())
	id := chi.URLParam(r, "id")
	// Ownership must be confirmed before touching the pipeline runner:
	// pipelineRunner.cancel is keyed only by presentation id, so calling
	// it for an id that turns out to belong to another business would
	// still cancel that other business's in-flight run (a cross-tenant
	// DoS) even though the subsequent DB write is business-scoped and
	// would fail — the side effect happens regardless of the later check.
	if _, ok := m.requirePresentationAccess(w, r, id); !ok {
		return
	}

	if err := m.cancelProcessing(r.Context(), id, access.BusinessID); err != nil {
		m.deps.Log.Error().Err(err).Str("presentation_id", id).Msg("cancel presentation processing")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to cancel processing")
		return
	}

	httpx.NoContent(w)
}

func (m *Module) regenerateScripts(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())
	id := chi.URLParam(r, "id")
	if _, ok := m.requirePresentationAccess(w, r, id); !ok {
		return
	}

	m.enqueueProcessing(id, access.BusinessID, false)

	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}
