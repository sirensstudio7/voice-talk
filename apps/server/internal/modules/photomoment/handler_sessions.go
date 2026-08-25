package photomoment

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/httpx"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/platform/storage"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

// loadSession fetches a photo_sessions row scoped to businessID and
// writes 404 itself on mismatch or absence — every guest-facing handler
// below calls this first so a session ID from one business can never be
// read or mutated via another business's {slug}.
func (m *Module) loadSession(w http.ResponseWriter, r *http.Request, businessID string) (store.PhotoSession, bool) {
	id := chi.URLParam(r, "id")
	session, err := m.store.GetPhotoSession(r.Context(), store.GetPhotoSessionParams{ID: id, BusinessID: businessID})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "session_not_found", "photo session not found")
			return store.PhotoSession{}, false
		}
		m.deps.Log.Error().Err(err).Str("session_id", id).Msg("get photo session")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load photo session")
		return store.PhotoSession{}, false
	}
	return session, true
}

func isForeignKeyViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23503"
}

func (m *Module) startPhotoSession(w http.ResponseWriter, r *http.Request) {
	business, ok := m.resolvePublicBusiness(w, r)
	if !ok {
		return
	}

	settings, err := m.getOrCreateSettings(r.Context(), business.ID)
	if err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", business.ID).Msg("get photo settings for session start")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to start photo session")
		return
	}
	if !settings.Enabled {
		httpx.Error(w, http.StatusForbidden, "photo_moment_disabled", "smart photo moment is not enabled for this business")
		return
	}

	var req startSessionRequest
	_ = json.NewDecoder(r.Body).Decode(&req) // body is optional

	session, err := m.store.CreatePhotoSession(r.Context(), store.CreatePhotoSessionParams{
		ID:         uuid.NewString(),
		BusinessID: business.ID,
		OrderID:    textArg(req.OrderID),
	})
	if err != nil {
		if isForeignKeyViolation(err) {
			httpx.Error(w, http.StatusBadRequest, "order_not_found", "order_id does not exist")
			return
		}
		m.deps.Log.Error().Err(err).Str("business_id", business.ID).Msg("create photo session")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to start photo session")
		return
	}

	if m.deps.Meter != nil {
		if err := m.deps.Meter.Record(r.Context(), business.ID, eventPhotoSessionStarted, 1, nil); err != nil {
			m.deps.Log.Warn().Err(err).Str("session_id", session.ID).Msg("record photomoment session_started event")
		}
	}

	httpx.JSON(w, http.StatusCreated, toSessionOut(session))
}

func (m *Module) setSessionResponse(w http.ResponseWriter, r *http.Request) {
	business, ok := m.resolvePublicBusiness(w, r)
	if !ok {
		return
	}
	session, ok := m.loadSession(w, r, business.ID)
	if !ok {
		return
	}
	if session.Status != sessionStarted {
		httpx.Error(w, http.StatusConflict, "invalid_state", "session already has a response")
		return
	}

	var req sessionResponseRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "invalid request body")
		return
	}

	var status string
	var eventType string
	switch req.Response {
	case "accepted":
		status, eventType = sessionAccepted, eventPhotoAccepted
	case "declined":
		status, eventType = sessionDeclined, eventPhotoDeclined
	default:
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "response must be \"accepted\" or \"declined\"")
		return
	}

	updated, err := m.store.SetPhotoSessionResponse(r.Context(), store.SetPhotoSessionResponseParams{
		ID: session.ID, VisitorResponse: pgTextValid(req.Response), Status: status,
	})
	if err != nil {
		m.deps.Log.Error().Err(err).Str("session_id", session.ID).Msg("set photo session response")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to save response")
		return
	}

	if m.deps.Meter != nil {
		if err := m.deps.Meter.Record(r.Context(), business.ID, eventType, 1, nil); err != nil {
			m.deps.Log.Warn().Err(err).Str("session_id", session.ID).Msg("record photomoment response event")
		}
	}

	httpx.JSON(w, http.StatusOK, toSessionOut(updated))
}

func (m *Module) uploadPhoto(w http.ResponseWriter, r *http.Request) {
	business, ok := m.resolvePublicBusiness(w, r)
	if !ok {
		return
	}
	session, ok := m.loadSession(w, r, business.ID)
	if !ok {
		return
	}
	if session.Status != sessionAccepted {
		httpx.Error(w, http.StatusConflict, "invalid_state", "session must be accepted before uploading a photo")
		return
	}
	if m.deps.Storage == nil {
		httpx.Error(w, http.StatusServiceUnavailable, "storage_unavailable", "file storage is not configured")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, storage.MaxPhotoUploadBytes+1<<20)
	file, _, err := r.FormFile("file")
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "a multipart file field named \"file\" is required")
		return
	}
	defer func() { _ = file.Close() }()

	raw, err := io.ReadAll(file)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "failed to read uploaded file")
		return
	}
	if len(raw) > storage.MaxPhotoUploadBytes {
		httpx.Error(w, http.StatusBadRequest, "file_too_large", "file exceeds 8MB limit")
		return
	}

	settings, err := m.getOrCreateSettings(r.Context(), business.ID)
	if err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", business.ID).Msg("get photo settings for compositing")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to process photo")
		return
	}

	logoBytes, frameBytes := m.loadBrandingAssets(r.Context(), settings)

	composited, err := applyBranding(raw, settings, logoBytes, frameBytes)
	if err != nil {
		m.deps.Log.Error().Err(err).Str("session_id", session.ID).Msg("composite photo")
		httpx.Error(w, http.StatusBadRequest, "invalid_image", "failed to process uploaded image")
		return
	}
	thumb, err := makeThumbnail(composited)
	if err != nil {
		m.deps.Log.Error().Err(err).Str("session_id", session.ID).Msg("generate thumbnail")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to process photo")
		return
	}

	photoKey := fmt.Sprintf("%s%s/%s/photo.jpg", storage.PrefixPhotos, business.ID, session.ID)
	thumbKey := fmt.Sprintf("%s%s/%s/thumbnail.jpg", storage.PrefixPhotos, business.ID, session.ID)
	if err := m.deps.Storage.Upload(r.Context(), photoKey, composited, "image/jpeg"); err != nil {
		m.deps.Log.Error().Err(err).Str("session_id", session.ID).Msg("upload composited photo")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to save photo")
		return
	}
	if err := m.deps.Storage.Upload(r.Context(), thumbKey, thumb, "image/jpeg"); err != nil {
		m.deps.Log.Error().Err(err).Str("session_id", session.ID).Msg("upload photo thumbnail")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to save photo")
		return
	}

	updated, err := m.store.SetPhotoSessionUpload(r.Context(), store.SetPhotoSessionUploadParams{
		ID: session.ID, PhotoPath: pgTextValid(photoKey), ThumbnailPath: pgTextValid(thumbKey),
	})
	if err != nil {
		m.deps.Log.Error().Err(err).Str("session_id", session.ID).Msg("save photo session upload")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to save photo")
		return
	}

	httpx.JSON(w, http.StatusOK, toSessionOut(updated))
}

// loadBrandingAssets downloads the business's logo/frame from storage for
// compositing, swallowing per-asset failures (a missing/corrupt branding
// asset degrades to "no watermark" rather than failing the whole capture).
func (m *Module) loadBrandingAssets(ctx context.Context, settings store.PhotoSetting) (logo, frame []byte) {
	if settings.LogoUrl.Valid {
		if data, err := m.deps.Storage.Download(ctx, settings.LogoUrl.String); err == nil {
			logo = data
		} else {
			m.deps.Log.Warn().Err(err).Str("business_id", settings.BusinessID).Msg("download logo for compositing")
		}
	}
	if settings.FrameUrl.Valid {
		if data, err := m.deps.Storage.Download(ctx, settings.FrameUrl.String); err == nil {
			frame = data
		} else {
			m.deps.Log.Warn().Err(err).Str("business_id", settings.BusinessID).Msg("download frame for compositing")
		}
	}
	return logo, frame
}

func (m *Module) completeSession(w http.ResponseWriter, r *http.Request) {
	business, ok := m.resolvePublicBusiness(w, r)
	if !ok {
		return
	}
	session, ok := m.loadSession(w, r, business.ID)
	if !ok {
		return
	}
	if session.Status != sessionCaptured {
		httpx.Error(w, http.StatusConflict, "invalid_state", "session must have an uploaded photo before completing")
		return
	}

	settings, err := m.getOrCreateSettings(r.Context(), business.ID)
	if err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", business.ID).Msg("get photo settings for completion")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to complete photo session")
		return
	}

	hours := settings.QrExpiryHours
	if hours <= 0 {
		hours = qrExpiryDefaultHours
	}
	expiresAt := time.Now().Add(time.Duration(hours) * time.Hour)

	token, err := generateToken()
	if err != nil {
		m.deps.Log.Error().Err(err).Str("session_id", session.ID).Msg("generate qr token")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to complete photo session")
		return
	}

	updated, err := m.store.CompletePhotoSession(r.Context(), store.CompletePhotoSessionParams{
		ID:                session.ID,
		QrToken:           pgTextValid(token),
		DownloadExpiresAt: pgtypeTimestamptz(expiresAt),
	})
	if err != nil {
		m.deps.Log.Error().Err(err).Str("session_id", session.ID).Msg("complete photo session")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to complete photo session")
		return
	}

	httpx.JSON(w, http.StatusOK, toSessionOut(updated))
}

func generateToken() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}
