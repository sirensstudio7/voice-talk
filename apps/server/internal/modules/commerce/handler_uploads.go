package commerce

import (
	"fmt"
	"io"
	"net/http"

	"github.com/google/uuid"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/httpx"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/platform/storage"
)

// uploadProductImage ports admin.ts's POST
// /admin/businesses/:businessId/product-images — a standalone upload
// that returns an image_url for the owner to attach to a product via a
// separate PATCH, matching legacy exactly (this endpoint doesn't take a
// product ID at all).
func (m *Module) uploadProductImage(w http.ResponseWriter, r *http.Request) {
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
		httpx.Error(w, http.StatusBadRequest, "file_too_large", "image must be 5 MB or smaller")
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
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "upload a PNG, JPG, WEBP, or GIF image")
		return
	}
	contentType := header.Header.Get("Content-Type")

	key := fmt.Sprintf("%s%s/%s%s", storage.PrefixProducts, access.BusinessID, uuid.NewString(), ext)
	if err := m.deps.Storage.Upload(r.Context(), key, data, contentType); err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", access.BusinessID).Msg("upload product image")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to upload file")
		return
	}

	url, err := m.deps.Storage.PublicURL(r.Context(), key)
	if err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", access.BusinessID).Msg("build product image public url")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to save image")
		return
	}

	httpx.JSON(w, http.StatusCreated, map[string]string{"image_url": url})
}
