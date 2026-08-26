package knowledge

import (
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/httpx"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/platform/storage"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

// uploadAvatar ports admin.ts's POST
// /admin/businesses/:businessId/ai-rules/avatar — like ai-rules itself,
// lazily creates the row on first use (getOrCreateAIRules).
func (m *Module) uploadAvatar(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())
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
	if len(data) == 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "uploaded file is empty")
		return
	}
	if len(data) > storage.MaxUploadBytes {
		httpx.Error(w, http.StatusBadRequest, "file_too_large", "avatar image must be 5 MB or smaller")
		return
	}

	var ext string
	switch header.Header.Get("Content-Type") {
	case "image/png":
		ext = ".png"
	case "image/jpeg", "image/jpg":
		ext = ".jpg"
	case "image/webp":
		ext = ".webp"
	case "image/gif":
		ext = ".gif"
	default:
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "upload a PNG, JPG, WEBP, or GIF image for the assistant avatar")
		return
	}
	contentType := header.Header.Get("Content-Type")

	if _, err := m.getOrCreateAIRules(r.Context(), access.BusinessID); err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", access.BusinessID).Msg("get or create ai_rules before avatar upload")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to upload avatar")
		return
	}

	key := fmt.Sprintf("%s%s/avatar-%s%s", storage.PrefixAvatars, access.BusinessID, strconv.FormatInt(time.Now().UnixMilli(), 10), ext)
	if err := m.deps.Storage.Upload(r.Context(), key, data, contentType); err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", access.BusinessID).Msg("upload avatar")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to upload file")
		return
	}

	url, err := m.deps.Storage.PublicURL(r.Context(), key)
	if err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", access.BusinessID).Msg("build avatar public url")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to save avatar")
		return
	}

	updated, err := m.store.SetAIRulesAvatarURL(r.Context(), store.SetAIRulesAvatarURLParams{
		BusinessID: access.BusinessID, AvatarUrl: url,
	})
	if err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", access.BusinessID).Msg("save avatar url")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to save avatar")
		return
	}

	httpx.JSON(w, http.StatusOK, toAIRulesOut(updated))
}

func (m *Module) deleteAvatar(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())

	if _, err := m.store.GetAIRules(r.Context(), access.BusinessID); err != nil {
		httpx.Error(w, http.StatusNotFound, "ai_rules_not_found", "AI rules not found")
		return
	}

	updated, err := m.store.SetAIRulesAvatarURL(r.Context(), store.SetAIRulesAvatarURLParams{
		BusinessID: access.BusinessID, AvatarUrl: "",
	})
	if err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", access.BusinessID).Msg("clear avatar url")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to remove avatar")
		return
	}

	httpx.JSON(w, http.StatusOK, toAIRulesOut(updated))
}
