package photomoment

import (
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/httpx"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

const downloadSignedURLTTL = 15 * time.Minute

// loadCompletedSession resolves a qr_token to its session, writing the
// appropriate error response itself: 404 for an unknown token, 410 once
// download_expires_at has passed. The expiry check happens live here —
// independent of cleanup.go's periodic status-flip job, which is a
// convenience for listing/analytics, not the actual enforcement point.
func (m *Module) loadCompletedSession(w http.ResponseWriter, r *http.Request) (store.PhotoSession, bool) {
	token := chi.URLParam(r, "token")
	session, err := m.store.GetPhotoSessionByToken(r.Context(), pgTextValid(token))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "download_not_found", "download link not found")
			return store.PhotoSession{}, false
		}
		m.deps.Log.Error().Err(err).Msg("get photo session by token")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to resolve download")
		return store.PhotoSession{}, false
	}
	if session.DownloadExpiresAt.Valid && session.DownloadExpiresAt.Time.Before(time.Now()) {
		httpx.Error(w, http.StatusGone, "download_expired", "this download link has expired")
		return store.PhotoSession{}, false
	}
	if !session.PhotoPath.Valid {
		httpx.Error(w, http.StatusNotFound, "download_not_found", "download link not found")
		return store.PhotoSession{}, false
	}
	return session, true
}

func (m *Module) resolveDownload(w http.ResponseWriter, r *http.Request) {
	session, ok := m.loadCompletedSession(w, r)
	if !ok {
		return
	}
	if m.deps.Storage == nil {
		httpx.Error(w, http.StatusServiceUnavailable, "storage_unavailable", "file storage is not configured")
		return
	}

	url, err := m.deps.Storage.SignedURL(r.Context(), session.PhotoPath.String, downloadSignedURLTTL)
	if err != nil {
		m.deps.Log.Error().Err(err).Str("session_id", session.ID).Msg("sign photo download url")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to resolve download")
		return
	}

	// MarkPhotoSessionDownloaded only affects a row on its first
	// resolution (WHERE downloaded_at IS NULL) — pgx.ErrNoRows here means
	// a repeat view, not a failure. Firing the analytics event only on
	// that first transition is a deliberate deviation from legacy, which
	// fires it on every resolution; see the Phase 1 plan.
	if _, err := m.store.MarkPhotoSessionDownloaded(r.Context(), session.ID); err == nil {
		if m.deps.Meter != nil {
			if err := m.deps.Meter.Record(r.Context(), session.BusinessID, eventPhotoDownloaded, 1, nil); err != nil {
				m.deps.Log.Warn().Err(err).Str("session_id", session.ID).Msg("record photomoment downloaded event")
			}
		}
	} else if !errors.Is(err, pgx.ErrNoRows) {
		m.deps.Log.Warn().Err(err).Str("session_id", session.ID).Msg("mark photo session downloaded")
	}

	httpx.JSON(w, http.StatusOK, downloadOut{
		PhotoURL:  url,
		ExpiresAt: session.DownloadExpiresAt.Time.Format(time.RFC3339),
	})
}

func (m *Module) downloadQR(w http.ResponseWriter, r *http.Request) {
	session, ok := m.loadCompletedSession(w, r)
	if !ok {
		return
	}

	png, err := generateQRPNG(downloadURL(r, session.QrToken.String), 320)
	if err != nil {
		m.deps.Log.Error().Err(err).Str("session_id", session.ID).Msg("generate qr code")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to generate qr code")
		return
	}

	w.Header().Set("Content-Type", "image/png")
	w.Header().Set("Cache-Control", "private, max-age=3600")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(png)
}

// downloadURL builds the public URL a scanned QR code resolves to, from
// the incoming request's own scheme/host. There is no dedicated
// customer-facing download page yet (frontend work is deferred per the
// backend-first plan) — this points at the API's own JSON endpoint, which
// a future kiosk-facing page will call directly.
func downloadURL(r *http.Request, token string) string {
	scheme := "https"
	if proto := r.Header.Get("X-Forwarded-Proto"); proto != "" {
		scheme = proto
	} else if r.TLS == nil {
		scheme = "http"
	}
	return fmt.Sprintf("%s://%s/photo-downloads/%s", scheme, r.Host, token)
}
