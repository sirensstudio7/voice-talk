package auth

import (
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/capabilities"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/httpx"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/pricing"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/promptkit"
)

type menuProductOut struct {
	ID              string   `json:"id"`
	Name            string   `json:"name"`
	Price           float64  `json:"price"`
	OriginalPrice   *float64 `json:"original_price"`
	DiscountPercent float64  `json:"discount_percent"`
	Category        string   `json:"category"`
	Description     string   `json:"description"`
	ImageURL        string   `json:"image_url"`
	DurationMin     int32    `json:"duration_min"`
}

type menuPhotoMomentOut struct {
	Enabled          bool   `json:"enabled"`
	VoicePrompt      string `json:"voice_prompt"`
	CountdownSeconds int32  `json:"countdown_seconds"`
}

type menuOut struct {
	Business           string                    `json:"business"`
	Slug               string                    `json:"slug"`
	Tagline            string                    `json:"tagline"`
	BusinessType       string                    `json:"business_type"`
	AssistantName      string                    `json:"assistant_name"`
	AvatarURL          string                    `json:"avatar_url"`
	AvatarModelPath    string                    `json:"avatar_model_path"`
	BackgroundURL      string                    `json:"background_url"`
	GradientColor      string                    `json:"gradient_color"`
	DisplayOrientation string                    `json:"display_orientation"`
	VoicePreset        string                    `json:"voice_preset"`
	VoiceGender        string                    `json:"voice_gender"`
	Capabilities       capabilities.Capabilities `json:"capabilities"`
	SmartPhotoMoment   menuPhotoMomentOut        `json:"smart_photo_moment"`
	Products           []menuProductOut          `json:"products"`
}

// getMenu ports public.ts's GET /menu — the customer/kiosk app's single
// bootstrap call for everything it needs to render the initial voice
// page: business identity, ai_rules-derived assistant name/voice/avatar,
// appearance, capabilities, Smart Photo Moment's public config, and
// (when menu_enabled) the active product list with computed pricing.
//
// Deliberately omitted: legacy's "vision" field (camera-presence
// detection settings) — that entire feature (vision_settings/
// vision_events tables, /ws/vision, YOLO-based detection) is out of
// scope for this port; it needs GPU/CPU compute this deployment doesn't
// budget for yet. A kiosk relying on presence-triggered auto-greeting
// simply won't get one — manual "tap to start" still works via
// /businesses/{slug}/voice-session.
func (m *Module) getMenu(w http.ResponseWriter, r *http.Request) {
	slug := r.URL.Query().Get("business")
	if slug == "" {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "business query parameter is required")
		return
	}

	ctx := r.Context()
	business, err := m.store.GetBusinessBySlug(ctx, slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "business_not_found", "business not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load business")
		return
	}

	caps := capabilities.Get(business.PrimaryUseCase, business.BusinessType)

	rules, err := m.store.GetAIRules(ctx, business.ID)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load business")
		return
	}

	photo := menuPhotoMomentOut{}
	if settings, err := m.store.GetPhotoSettings(ctx, business.ID); err == nil {
		photo = menuPhotoMomentOut{Enabled: settings.Enabled, VoicePrompt: settings.VoicePrompt, CountdownSeconds: settings.CountdownSeconds}
	}

	var productsOut []menuProductOut
	if caps.MenuEnabled {
		products, err := m.store.ListActiveProductsForBusiness(ctx, business.ID)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load products")
			return
		}
		productsOut = make([]menuProductOut, 0, len(products))
		for _, p := range promptkit.ActiveProducts(products) {
			out := menuProductOut{
				ID: p.ProductID, Name: p.Name, Price: pricing.EffectivePrice(p.Price, p.DiscountPercent),
				DiscountPercent: p.DiscountPercent, Category: p.Category, Description: p.Description,
				ImageURL: p.ImageUrl, DurationMin: p.DurationMin,
			}
			if p.DiscountPercent > 0 {
				orig := p.Price
				out.OriginalPrice = &orig
			}
			productsOut = append(productsOut, out)
		}
	}

	httpx.JSON(w, http.StatusOK, menuOut{
		Business: business.Name, Slug: business.Slug, Tagline: business.Tagline, BusinessType: business.BusinessType,
		AssistantName: promptkit.ResolveAssistantName(rules), AvatarURL: rules.AvatarUrl, AvatarModelPath: rules.AvatarModelPath,
		BackgroundURL: business.BackgroundUrl, GradientColor: business.GradientColor, DisplayOrientation: displayOrientationOrDefault(business.DisplayOrientation),
		VoicePreset: promptkit.NormalizeVoicePreset(rules.VoicePreset), VoiceGender: promptkit.NormalizeVoiceGender(rules.VoiceGender),
		Capabilities: caps, SmartPhotoMoment: photo, Products: productsOut,
	})
}

func displayOrientationOrDefault(v string) string {
	if v == "" {
		return "landscape"
	}
	return v
}
