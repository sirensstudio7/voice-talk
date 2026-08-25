package photomoment

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/httpx"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/platform/storage"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

const brandingSignedURLTTL = 15 * time.Minute

// settingsOutWithSignedURLs resolves the raw storage keys held in
// logo_url/frame_url to time-limited signed URLs before returning them —
// internal/platform/storage.Client only ever exposes private+signed
// access. A signing failure is logged and the field left nil rather than
// failing the whole response, matching the gallery's resilience posture.
func (m *Module) settingsOutWithSignedURLs(ctx context.Context, s store.PhotoSetting) settingsOut {
	out := toSettingsOut(s)
	if m.deps.Storage == nil {
		return out
	}
	if s.LogoUrl.Valid {
		if url, err := m.deps.Storage.SignedURL(ctx, s.LogoUrl.String, brandingSignedURLTTL); err == nil {
			out.LogoURL = &url
		} else {
			m.deps.Log.Warn().Err(err).Str("business_id", s.BusinessID).Msg("sign logo url")
		}
	}
	if s.FrameUrl.Valid {
		if url, err := m.deps.Storage.SignedURL(ctx, s.FrameUrl.String, brandingSignedURLTTL); err == nil {
			out.FrameURL = &url
		} else {
			m.deps.Log.Warn().Err(err).Str("business_id", s.BusinessID).Msg("sign frame url")
		}
	}
	return out
}

func brandingKind(r *http.Request) (string, bool) {
	kind := chi.URLParam(r, "kind")
	return kind, kind == "logo" || kind == "frame"
}

func (m *Module) uploadBranding(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())

	kind, ok := brandingKind(r)
	if !ok {
		httpx.Error(w, http.StatusBadRequest, "invalid_kind", "kind must be \"logo\" or \"frame\"")
		return
	}
	if m.deps.Storage == nil {
		httpx.Error(w, http.StatusServiceUnavailable, "storage_unavailable", "file storage is not configured")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, storage.MaxUploadBytes+1<<20)
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
	if len(data) > storage.MaxUploadBytes {
		httpx.Error(w, http.StatusBadRequest, "file_too_large", "file exceeds 5MB limit")
		return
	}

	contentType := header.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	ext := extensionForContentType(contentType, header.Filename)

	key := fmt.Sprintf("%s%s/branding/%s%s", storage.PrefixPhotos, access.BusinessID, kind, ext)
	if err := m.deps.Storage.Upload(r.Context(), key, data, contentType); err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", access.BusinessID).Str("kind", kind).Msg("upload branding asset")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to upload file")
		return
	}

	if _, err := m.getOrCreateSettings(r.Context(), access.BusinessID); err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", access.BusinessID).Msg("get photo settings before branding update")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to save branding")
		return
	}

	var updated store.PhotoSetting
	if kind == "logo" {
		updated, err = m.store.SetPhotoLogoURL(r.Context(), store.SetPhotoLogoURLParams{BusinessID: access.BusinessID, LogoUrl: pgTextValid(key)})
	} else {
		updated, err = m.store.SetPhotoFrameURL(r.Context(), store.SetPhotoFrameURLParams{BusinessID: access.BusinessID, FrameUrl: pgTextValid(key)})
	}
	if err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", access.BusinessID).Str("kind", kind).Msg("save branding url")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to save branding")
		return
	}

	httpx.JSON(w, http.StatusOK, m.settingsOutWithSignedURLs(r.Context(), updated))
}

func (m *Module) deleteBranding(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())

	kind, ok := brandingKind(r)
	if !ok {
		httpx.Error(w, http.StatusBadRequest, "invalid_kind", "kind must be \"logo\" or \"frame\"")
		return
	}

	settings, err := m.getOrCreateSettings(r.Context(), access.BusinessID)
	if err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", access.BusinessID).Msg("get photo settings before branding delete")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to remove branding")
		return
	}

	var key string
	if kind == "logo" {
		key = settings.LogoUrl.String
	} else {
		key = settings.FrameUrl.String
	}
	if key != "" && m.deps.Storage != nil {
		if err := m.deps.Storage.Delete(r.Context(), key); err != nil {
			m.deps.Log.Warn().Err(err).Str("business_id", access.BusinessID).Str("kind", kind).Msg("delete branding asset from storage")
		}
	}

	var updated store.PhotoSetting
	if kind == "logo" {
		updated, err = m.store.SetPhotoLogoURL(r.Context(), store.SetPhotoLogoURLParams{BusinessID: access.BusinessID})
	} else {
		updated, err = m.store.SetPhotoFrameURL(r.Context(), store.SetPhotoFrameURLParams{BusinessID: access.BusinessID})
	}
	if err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", access.BusinessID).Str("kind", kind).Msg("clear branding url")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to remove branding")
		return
	}

	httpx.JSON(w, http.StatusOK, m.settingsOutWithSignedURLs(r.Context(), updated))
}

func extensionForContentType(contentType, filename string) string {
	switch contentType {
	case "image/png":
		return ".png"
	case "image/jpeg", "image/jpg":
		return ".jpg"
	case "image/webp":
		return ".webp"
	}
	for _, ext := range []string{".png", ".jpg", ".jpeg", ".webp"} {
		if len(filename) > len(ext) && filename[len(filename)-len(ext):] == ext {
			return ext
		}
	}
	return ".png"
}
