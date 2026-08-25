package presenter

import (
	"errors"
	"fmt"
	"io"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/httpx"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/platform/storage"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

// uploadPresentationFile mirrors the POST .../files route: single
// multipart file, 50MB cap, pptx/pdf/docx/txt only. .ppt (legacy binary
// PowerPoint) is rejected here rather than accepted-then-failed-at-process
// — a deliberate deviation from legacy, see the Phase 1 plan.
func (m *Module) uploadPresentationFile(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())
	presentationID := chi.URLParam(r, "id")

	if m.deps.Storage == nil {
		httpx.Error(w, http.StatusServiceUnavailable, "storage_unavailable", "file storage is not configured")
		return
	}

	if _, err := m.store.GetPresentation(r.Context(), store.GetPresentationParams{ID: presentationID, BusinessID: access.BusinessID}); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "presentation_not_found", "presentation not found")
			return
		}
		m.deps.Log.Error().Err(err).Str("presentation_id", presentationID).Msg("get presentation for upload")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to upload file")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, storage.MaxPresentationUploadBytes+1<<20)
	file, header, err := r.FormFile("file")
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "a multipart file field named \"file\" is required")
		return
	}
	defer func() { _ = file.Close() }()

	data, err := io.ReadAll(file)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "failed to read uploaded file")
		return
	}
	if len(data) > storage.MaxPresentationUploadBytes {
		httpx.Error(w, http.StatusBadRequest, "file_too_large", "file exceeds 50MB limit")
		return
	}

	fileType, ok := detectFileType(header.Filename, header.Header.Get("Content-Type"))
	if !ok {
		httpx.Error(w, http.StatusBadRequest, "unsupported_file_type", "unsupported file type. Use PPTX, PDF, DOCX, or TXT.")
		return
	}
	if fileType == "ppt" {
		httpx.Error(w, http.StatusBadRequest, "unsupported_file_type", "legacy .ppt is not supported. Please upload .pptx")
		return
	}

	key := fmt.Sprintf("%s%s/%s/%s-%s", storage.PrefixPresentations, access.BusinessID, presentationID, uuid.NewString(), header.Filename)
	contentType := header.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	if err := m.deps.Storage.Upload(r.Context(), key, data, contentType); err != nil {
		m.deps.Log.Error().Err(err).Str("presentation_id", presentationID).Msg("upload presentation file to storage")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to upload file")
		return
	}

	f, err := m.store.CreatePresentationFile(r.Context(), store.CreatePresentationFileParams{
		ID: uuid.NewString(), PresentationID: presentationID,
		FileName: header.Filename, FileType: fileType, SizeBytes: int32(len(data)), StoragePath: key,
	})
	if err != nil {
		m.deps.Log.Error().Err(err).Str("presentation_id", presentationID).Msg("create presentation file row")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to upload file")
		return
	}

	// A new upload invalidates any prior processing result — matches
	// legacy's reset-to-draft-on-upload behavior.
	if err := m.store.ResetPresentationToDraft(r.Context(), store.ResetPresentationToDraftParams{ID: presentationID, BusinessID: access.BusinessID}); err != nil {
		m.deps.Log.Error().Err(err).Str("presentation_id", presentationID).Msg("reset presentation to draft after upload")
	}

	httpx.JSON(w, http.StatusCreated, toFileOut(f))
}

// downloadPresentationPptx is an authenticated proxy for the deck's pptx
// bytes — internal/platform/storage.Client only ever exposes
// private+signed access (no public-URL method), so this route both
// satisfies legacy's "avoid CORS for the in-browser deck viewer" intent
// and resolves the public-vs-proxy inconsistency the research flagged in
// legacy's storage layer.
func (m *Module) downloadPresentationPptx(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())
	presentationID := chi.URLParam(r, "id")

	if m.deps.Storage == nil {
		httpx.Error(w, http.StatusServiceUnavailable, "storage_unavailable", "file storage is not configured")
		return
	}

	if _, err := m.store.GetPresentation(r.Context(), store.GetPresentationParams{ID: presentationID, BusinessID: access.BusinessID}); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "presentation_not_found", "presentation not found")
			return
		}
		m.deps.Log.Error().Err(err).Str("presentation_id", presentationID).Msg("get presentation for pptx download")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to download file")
		return
	}

	f, err := m.store.GetPresentationFileByType(r.Context(), store.GetPresentationFileByTypeParams{PresentationID: presentationID, FileType: "pptx"})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "file_not_found", "no pptx file uploaded for this presentation")
			return
		}
		m.deps.Log.Error().Err(err).Str("presentation_id", presentationID).Msg("get pptx file row")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to download file")
		return
	}

	data, err := m.deps.Storage.Download(r.Context(), f.StoragePath)
	if err != nil {
		m.deps.Log.Error().Err(err).Str("presentation_id", presentationID).Msg("download pptx from storage")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to download file")
		return
	}

	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.presentationml.presentation")
	w.Header().Set("Content-Disposition", fmt.Sprintf("inline; filename=%q", f.FileName))
	w.Header().Set("Cache-Control", "private, max-age=86400")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}
