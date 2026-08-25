package photomoment

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/httpx"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

const (
	gallerySignedURLTTL = 15 * time.Minute
	galleryDefaultLimit = 30
	galleryMaxLimit     = 100
)

func paginationParams(r *http.Request) (limit, offset int32) {
	limit = galleryDefaultLimit
	if v, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && v > 0 {
		limit = int32(min(v, galleryMaxLimit))
	}
	if v, err := strconv.Atoi(r.URL.Query().Get("offset")); err == nil && v >= 0 {
		offset = int32(v)
	}
	return limit, offset
}

func (m *Module) listGallery(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())
	limit, offset := paginationParams(r)

	sessions, err := m.store.ListPhotoGalleryForBusiness(r.Context(), store.ListPhotoGalleryForBusinessParams{
		BusinessID: access.BusinessID, Limit: limit, Offset: offset,
	})
	if err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", access.BusinessID).Msg("list photo gallery")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load gallery")
		return
	}

	items := make([]galleryItemOut, len(sessions))
	for i, s := range sessions {
		items[i] = galleryItemOut{
			ID:        s.ID,
			Status:    s.Status,
			CreatedAt: s.CreatedAt.Time.Format(time.RFC3339),
		}
		if m.deps.Storage != nil {
			if s.PhotoPath.Valid {
				if url, err := m.deps.Storage.SignedURL(r.Context(), s.PhotoPath.String, gallerySignedURLTTL); err == nil {
					items[i].PhotoURL = &url
				} else {
					m.deps.Log.Warn().Err(err).Str("session_id", s.ID).Msg("sign gallery photo url")
				}
			}
			if s.ThumbnailPath.Valid {
				if url, err := m.deps.Storage.SignedURL(r.Context(), s.ThumbnailPath.String, gallerySignedURLTTL); err == nil {
					items[i].ThumbnailURL = &url
				} else {
					m.deps.Log.Warn().Err(err).Str("session_id", s.ID).Msg("sign gallery thumbnail url")
				}
			}
		}
	}

	httpx.List(w, http.StatusOK, items)
}

func (m *Module) deleteGalleryItem(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())
	sessionID := chi.URLParam(r, "sessionId")

	deleted, err := m.store.DeletePhotoSession(r.Context(), store.DeletePhotoSessionParams{ID: sessionID, BusinessID: access.BusinessID})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "session_not_found", "photo session not found")
			return
		}
		m.deps.Log.Error().Err(err).Str("session_id", sessionID).Msg("delete photo session")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to delete photo")
		return
	}

	if m.deps.Storage != nil {
		if deleted.PhotoPath.Valid {
			if err := m.deps.Storage.Delete(r.Context(), deleted.PhotoPath.String); err != nil {
				m.deps.Log.Warn().Err(err).Str("session_id", sessionID).Msg("delete photo from storage")
			}
		}
		if deleted.ThumbnailPath.Valid {
			if err := m.deps.Storage.Delete(r.Context(), deleted.ThumbnailPath.String); err != nil {
				m.deps.Log.Warn().Err(err).Str("session_id", sessionID).Msg("delete thumbnail from storage")
			}
		}
	}

	httpx.NoContent(w)
}

func (m *Module) getAnalytics(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())

	since := pgtypeTimestamptz(time.Now().Add(-30 * 24 * time.Hour))
	started, err1 := m.store.CountUsageEventsSince(r.Context(), store.CountUsageEventsSinceParams{BusinessID: access.BusinessID, EventType: eventPhotoSessionStarted, OccurredAt: since})
	accepted, err2 := m.store.CountUsageEventsSince(r.Context(), store.CountUsageEventsSinceParams{BusinessID: access.BusinessID, EventType: eventPhotoAccepted, OccurredAt: since})
	declined, err3 := m.store.CountUsageEventsSince(r.Context(), store.CountUsageEventsSinceParams{BusinessID: access.BusinessID, EventType: eventPhotoDeclined, OccurredAt: since})
	downloaded, err4 := m.store.CountUsageEventsSince(r.Context(), store.CountUsageEventsSinceParams{BusinessID: access.BusinessID, EventType: eventPhotoDownloaded, OccurredAt: since})
	if err := firstError(err1, err2, err3, err4); err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", access.BusinessID).Msg("count photomoment usage events")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load analytics")
		return
	}

	httpx.JSON(w, http.StatusOK, analyticsOut{
		SessionsStarted:  started,
		PhotosAccepted:   accepted,
		PhotosDeclined:   declined,
		PhotosDownloaded: downloaded,
	})
}

func firstError(errs ...error) error {
	for _, err := range errs {
		if err != nil {
			return err
		}
	}
	return nil
}
