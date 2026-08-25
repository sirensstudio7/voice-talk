package photomoment

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/httpx"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

// resolvePublicBusiness looks up a business by slug for the public
// (unauthenticated) endpoints, mirroring booking's helper of the same
// name/shape. Returns false and writes a 404 itself if not found.
func (m *Module) resolvePublicBusiness(w http.ResponseWriter, r *http.Request) (store.Business, bool) {
	slug := chi.URLParam(r, "slug")
	business, err := m.store.GetBusinessBySlug(r.Context(), slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "business_not_found", "business not found")
			return store.Business{}, false
		}
		m.deps.Log.Error().Err(err).Str("slug", slug).Msg("get business by slug")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load business")
		return store.Business{}, false
	}
	return business, true
}

// getOrCreateSettings returns the business's photo_settings row, seeding
// a disabled-by-default row on first access — mirrors knowledge's
// getOrCreateAIRules pattern.
func (m *Module) getOrCreateSettings(ctx context.Context, businessID string) (store.PhotoSetting, error) {
	settings, err := m.store.GetPhotoSettings(ctx, businessID)
	if err == nil {
		return settings, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return store.PhotoSetting{}, err
	}
	return m.store.CreatePhotoSettings(ctx, businessID)
}

func (m *Module) getPublicPhotoConfig(w http.ResponseWriter, r *http.Request) {
	business, ok := m.resolvePublicBusiness(w, r)
	if !ok {
		return
	}

	settings, err := m.getOrCreateSettings(r.Context(), business.ID)
	if err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", business.ID).Msg("get photo settings for public config")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load photo config")
		return
	}

	httpx.JSON(w, http.StatusOK, publicConfigOut{
		Enabled:          settings.Enabled,
		VoicePrompt:      settings.VoicePrompt,
		CountdownSeconds: settings.CountdownSeconds,
	})
}

func (m *Module) getSettings(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())

	settings, err := m.getOrCreateSettings(r.Context(), access.BusinessID)
	if err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", access.BusinessID).Msg("get photo settings")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load settings")
		return
	}

	httpx.JSON(w, http.StatusOK, m.settingsOutWithSignedURLs(r.Context(), settings))
}

func (m *Module) updateSettings(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())

	if _, err := m.getOrCreateSettings(r.Context(), access.BusinessID); err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", access.BusinessID).Msg("get photo settings for update")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to update settings")
		return
	}

	var req updateSettingsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "invalid request body")
		return
	}

	updated, err := m.store.UpdatePhotoSettings(r.Context(), store.UpdatePhotoSettingsParams{
		BusinessID:       access.BusinessID,
		Enabled:          boolArg(req.Enabled),
		VoicePrompt:      textArg(req.VoicePrompt),
		CountdownSeconds: int4Arg(req.CountdownSeconds),
		QrExpiryHours:    int4Arg(req.QrExpiryHours),
		CampaignText:     textArg(req.CampaignText),
		AutoDeleteDays:   int4Arg(req.AutoDeleteDays),
	})
	if err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", access.BusinessID).Msg("update photo settings")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to update settings")
		return
	}

	httpx.JSON(w, http.StatusOK, m.settingsOutWithSignedURLs(r.Context(), updated))
}
