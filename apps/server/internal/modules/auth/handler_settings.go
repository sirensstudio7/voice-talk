package auth

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/httpx"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/onboarding"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/platform/storage"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/promptkit"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

func textArg(s *string) pgtype.Text {
	if s == nil {
		return pgtype.Text{}
	}
	return pgtype.Text{String: *s, Valid: true}
}

// checkSlug ports admin.ts's GET /admin/businesses/check-slug — any
// authenticated user may probe slug availability while naming a new
// workspace.
func (m *Module) checkSlug(w http.ResponseWriter, r *http.Request) {
	if _, ok := httpx.UserIDFromContext(r.Context()); !ok {
		httpx.Error(w, http.StatusUnauthorized, "not_authenticated", "not authenticated")
		return
	}

	slug := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("slug")))
	if !onboarding.IsValidSlug(slug) {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "invalid slug format")
		return
	}

	if _, err := m.store.GetBusinessBySlug(r.Context(), slug); err == nil {
		httpx.JSON(w, http.StatusOK, map[string]any{
			"available":   false,
			"suggestions": onboarding.SlugSuggestions(slug),
		})
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]any{"available": true})
}

type updateBusinessRequest struct {
	Name        *string `json:"name"`
	Tagline     *string `json:"tagline"`
	VoiceName   *string `json:"voice_name"`
	GeminiModel *string `json:"gemini_model"`
	IsActive    *bool   `json:"is_active"`
}

// updateBusiness ports admin.ts's PATCH /admin/businesses/:businessId —
// general workspace settings, open to any business member (matching
// legacy's requireBusinessAccess, which doesn't itself gate by role).
func (m *Module) updateBusiness(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())

	var req updateBusinessRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "invalid request body")
		return
	}

	var isActive pgtype.Bool
	if req.IsActive != nil {
		isActive = pgtype.Bool{Bool: *req.IsActive, Valid: true}
	}

	updated, err := m.store.UpdateBusinessGeneral(r.Context(), store.UpdateBusinessGeneralParams{
		ID:          access.BusinessID,
		Name:        textArg(req.Name),
		Tagline:     textArg(req.Tagline),
		VoiceName:   textArg(req.VoiceName),
		GeminiModel: textArg(req.GeminiModel),
		IsActive:    isActive,
	})
	if err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", access.BusinessID).Msg("update business")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to update business")
		return
	}

	httpx.JSON(w, http.StatusOK, toBusinessOut(updated))
}

type onboardingRequest struct {
	BusinessType   string `json:"business_type"`
	PrimaryUseCase string `json:"primary_use_case"`
	Language       string `json:"language"`
}

type onboardingResponse struct {
	Business businessOut `json:"business"`
	AIRules  aiRulesOut  `json:"ai_rules"`
}

type aiRulesOut struct {
	ID               string `json:"id"`
	AssistantName    string `json:"assistant_name"`
	Personality      string `json:"personality"`
	Tone             string `json:"tone"`
	Language         string `json:"language"`
	ToolInstructions string `json:"tool_instructions"`
}

func toSettingsAIRulesOut(r store.AiRule) aiRulesOut {
	return aiRulesOut{
		ID: r.ID, AssistantName: r.AssistantName, Personality: r.Personality,
		Tone: r.Tone, Language: r.Language, ToolInstructions: r.ToolInstructions,
	}
}

// updateOnboarding ports admin.ts's PATCH /admin/businesses/:businessId/onboarding
// — completes an owner's first-run setup, tagging the business with its
// type/use-case and seeding (or refreshing) ai_rules with a
// business-aware persona via promptkit.BuildOnboardingAIRules, distinct
// from the generic DefaultPersonality fallback knowledge/ uses for a
// business that skipped onboarding entirely.
func (m *Module) updateOnboarding(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())

	var req onboardingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "invalid request body")
		return
	}
	if req.BusinessType == "" || req.PrimaryUseCase == "" {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "business type and primary use case are required to complete onboarding")
		return
	}

	business, err := m.store.GetBusinessByID(r.Context(), access.BusinessID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load business")
		return
	}

	personality, language, toolInstructions := promptkit.BuildOnboardingAIRules(business.Name, req.BusinessType, req.PrimaryUseCase, req.Language)

	updatedBusiness, err := m.store.UpdateBusinessOnboarding(r.Context(), store.UpdateBusinessOnboardingParams{
		ID: access.BusinessID, BusinessType: req.BusinessType, PrimaryUseCase: req.PrimaryUseCase,
	})
	if err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", access.BusinessID).Msg("update business onboarding")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to complete onboarding")
		return
	}

	if _, err := m.store.GetAIRules(r.Context(), access.BusinessID); err != nil {
		if _, err := m.store.CreateAIRules(r.Context(), store.CreateAIRulesParams{
			ID: uuid.NewString(), BusinessID: access.BusinessID, AssistantName: "Lorescale",
			Personality: personality, Tone: "friendly",
		}); err != nil {
			m.deps.Log.Error().Err(err).Str("business_id", access.BusinessID).Msg("create ai_rules for onboarding")
			httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to complete onboarding")
			return
		}
	}

	rules, err := m.store.UpdateAIRules(r.Context(), store.UpdateAIRulesParams{
		BusinessID: access.BusinessID, Personality: textArg(&personality),
		Language: textArg(&language), ToolInstructions: textArg(&toolInstructions),
	})
	if err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", access.BusinessID).Msg("update ai_rules for onboarding")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to complete onboarding")
		return
	}

	httpx.JSON(w, http.StatusOK, onboardingResponse{
		Business: toBusinessOut(updatedBusiness),
		AIRules:  toSettingsAIRulesOut(rules),
	})
}

// getPayment ports both public.ts's GET /businesses/:slug/payment and
// admin.ts's owner-facing equivalent — the QR code isn't sensitive (a
// customer needs to see it to pay), so this module exposes one public
// route for both, same posture as getBusinessBySlug.
func (m *Module) getPayment(w http.ResponseWriter, r *http.Request) {
	business, err := m.businessFromSlugParam(r)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "business_not_found", "business not found")
		return
	}
	httpx.JSON(w, http.StatusOK, paymentOut{PaymentQRURL: business.PaymentQrUrl})
}

func (m *Module) businessFromSlugParam(r *http.Request) (store.Business, error) {
	slug := chi.URLParam(r, "slug")
	return m.store.GetBusinessBySlug(r.Context(), slug)
}

func (m *Module) uploadPaymentQR(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())
	if m.deps.Storage == nil {
		httpx.Error(w, http.StatusServiceUnavailable, "storage_unavailable", "file storage is not configured")
		return
	}

	data, contentType, ext, ok := readUploadedImage(w, r)
	if !ok {
		return
	}

	key := fmt.Sprintf("%s%s/qr%s", storage.PrefixPayments, access.BusinessID, ext)
	if err := m.deps.Storage.Upload(r.Context(), key, data, contentType); err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", access.BusinessID).Msg("upload payment qr")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to upload file")
		return
	}

	url, err := m.deps.Storage.PublicURL(r.Context(), key)
	if err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", access.BusinessID).Msg("build payment qr public url")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to save payment qr")
		return
	}
	updated, err := m.store.UpdateBusinessPaymentQRURL(r.Context(), store.UpdateBusinessPaymentQRURLParams{
		ID: access.BusinessID, PaymentQrUrl: url,
	})
	if err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", access.BusinessID).Msg("save payment qr url")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to save payment qr")
		return
	}

	httpx.JSON(w, http.StatusOK, paymentOut{PaymentQRURL: updated.PaymentQrUrl})
}

func (m *Module) deletePaymentQR(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())

	updated, err := m.store.UpdateBusinessPaymentQRURL(r.Context(), store.UpdateBusinessPaymentQRURLParams{
		ID: access.BusinessID, PaymentQrUrl: "",
	})
	if err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", access.BusinessID).Msg("clear payment qr url")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to remove payment qr")
		return
	}

	httpx.JSON(w, http.StatusOK, paymentOut{PaymentQRURL: updated.PaymentQrUrl})
}

func (m *Module) getAppearance(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())
	business, err := m.store.GetBusinessByID(r.Context(), access.BusinessID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load appearance")
		return
	}
	httpx.JSON(w, http.StatusOK, toAppearanceOut(business))
}

var validOrientations = map[string]bool{"landscape": true, "portrait": true}

type updateAppearanceRequest struct {
	GradientColor      *string `json:"gradient_color"`
	DisplayOrientation *string `json:"display_orientation"`
}

func (m *Module) updateAppearance(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())

	var req updateAppearanceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "invalid request body")
		return
	}

	var gradient, orientation *string
	if req.GradientColor != nil {
		g := normalizeGradientColor(*req.GradientColor)
		gradient = &g
	}
	if req.DisplayOrientation != nil {
		if !validOrientations[*req.DisplayOrientation] {
			httpx.Error(w, http.StatusBadRequest, "invalid_request", "display_orientation must be \"landscape\" or \"portrait\"")
			return
		}
		orientation = req.DisplayOrientation
	}

	updated, err := m.store.UpdateBusinessAppearance(r.Context(), store.UpdateBusinessAppearanceParams{
		ID: access.BusinessID, GradientColor: textArg(gradient), DisplayOrientation: textArg(orientation),
	})
	if err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", access.BusinessID).Msg("update appearance")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to update appearance")
		return
	}

	httpx.JSON(w, http.StatusOK, toAppearanceOut(updated))
}

// normalizeGradientColor keeps only a well-formed #RRGGBB hex string,
// matching admin.ts's normalizeGradientColor — anything else clears the
// field rather than erroring, since it's a cosmetic setting.
func normalizeGradientColor(value string) string {
	if len(value) == 7 && value[0] == '#' {
		for _, c := range value[1:] {
			if (c < '0' || c > '9') && (c < 'a' || c > 'f') && (c < 'A' || c > 'F') {
				return ""
			}
		}
		return value
	}
	return ""
}

func (m *Module) uploadBackground(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())
	if m.deps.Storage == nil {
		httpx.Error(w, http.StatusServiceUnavailable, "storage_unavailable", "file storage is not configured")
		return
	}

	data, contentType, ext, ok := readUploadedImage(w, r)
	if !ok {
		return
	}

	key := fmt.Sprintf("%s%s/background%s", storage.PrefixBackgrounds, access.BusinessID, ext)
	if err := m.deps.Storage.Upload(r.Context(), key, data, contentType); err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", access.BusinessID).Msg("upload background")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to upload file")
		return
	}

	url, err := m.deps.Storage.PublicURL(r.Context(), key)
	if err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", access.BusinessID).Msg("build background public url")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to save background")
		return
	}
	updated, err := m.store.UpdateBusinessBackgroundURL(r.Context(), store.UpdateBusinessBackgroundURLParams{
		ID: access.BusinessID, BackgroundUrl: url,
	})
	if err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", access.BusinessID).Msg("save background url")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to save background")
		return
	}

	httpx.JSON(w, http.StatusOK, toAppearanceOut(updated))
}

func (m *Module) deleteBackground(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())

	business, err := m.store.GetBusinessByID(r.Context(), access.BusinessID)
	if err == nil && business.BackgroundUrl != "" && m.deps.Storage != nil {
		if err := m.deps.Storage.Delete(r.Context(), business.BackgroundUrl); err != nil {
			m.deps.Log.Warn().Err(err).Str("business_id", access.BusinessID).Msg("delete background asset from storage")
		}
	}

	updated, err := m.store.UpdateBusinessBackgroundURL(r.Context(), store.UpdateBusinessBackgroundURLParams{
		ID: access.BusinessID, BackgroundUrl: "",
	})
	if err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", access.BusinessID).Msg("clear background url")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to remove background")
		return
	}

	httpx.JSON(w, http.StatusOK, toAppearanceOut(updated))
}

type updateMeRequest struct {
	Country *string `json:"country"`
}

// updateMe ports admin.ts's PATCH /admin/auth/me — sets the caller's
// 2-letter country once (a no-op if already set, matching legacy exactly:
// it's meant for a one-time signup-flow prompt, not a settings field).
func (m *Module) updateMe(w http.ResponseWriter, r *http.Request) {
	userID, ok := httpx.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "not_authenticated", "not authenticated")
		return
	}

	var req updateMeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "invalid request body")
		return
	}

	country := ""
	if req.Country != nil {
		country = normalizeCountry(*req.Country)
		if country == "" && *req.Country != "" {
			httpx.Error(w, http.StatusBadRequest, "invalid_request", "country must be a 2-letter ISO code")
			return
		}
	}

	user, err := m.store.GetUserByID(r.Context(), userID)
	if err != nil {
		httpx.Error(w, http.StatusUnauthorized, "not_authenticated", "not authenticated")
		return
	}

	if country == "" || user.Country != "" {
		httpx.JSON(w, http.StatusOK, toUserOut(user))
		return
	}

	updated, err := m.store.UpdateUserCountry(r.Context(), store.UpdateUserCountryParams{ID: userID, Country: country})
	if err != nil {
		m.deps.Log.Error().Err(err).Str("user_id", userID).Msg("update user country")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to update account")
		return
	}

	httpx.JSON(w, http.StatusOK, toUserOut(updated))
}

func normalizeCountry(raw string) string {
	if len(raw) != 2 {
		return ""
	}
	for _, c := range raw {
		if (c < 'A' || c > 'Z') && (c < 'a' || c > 'z') {
			return ""
		}
	}
	return raw
}

// readUploadedImage handles the shared multipart-file/size/type-validation
// path for payment-qr and background uploads — mirrors photomoment's
// branding upload validation, capped at storage.MaxUploadBytes (5MB) per
// admin.ts's ALLOWED_IMAGE_TYPES/MAX_UPLOAD_BYTES.
func readUploadedImage(w http.ResponseWriter, r *http.Request) (data []byte, contentType, ext string, ok bool) {
	r.Body = http.MaxBytesReader(w, r.Body, storage.MaxUploadBytes+1<<20)
	file, header, err := r.FormFile("file")
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "a multipart file field named \"file\" is required")
		return nil, "", "", false
	}
	defer func() { _ = file.Close() }()

	data, err = io.ReadAll(file)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "failed to read uploaded file")
		return nil, "", "", false
	}
	if len(data) == 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "uploaded file is empty")
		return nil, "", "", false
	}
	if len(data) > storage.MaxUploadBytes {
		httpx.Error(w, http.StatusBadRequest, "file_too_large", "image must be 5 MB or smaller")
		return nil, "", "", false
	}

	contentType = header.Header.Get("Content-Type")
	switch contentType {
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
		return nil, "", "", false
	}

	return data, contentType, ext, true
}
