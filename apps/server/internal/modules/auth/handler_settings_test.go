package auth

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/google/uuid"
)

// signupAndCreateBusiness is a small shared helper: signs up a fresh user
// and has them create one business, returning the token and slug.
func signupAndCreateBusiness(t *testing.T, handler http.Handler) (token, slug string) {
	t.Helper()
	email := "settings-" + uuid.NewString()[:8] + "@example.com"
	rec := doJSON(t, handler, http.MethodPost, "/auth/signup", "", signupRequest{
		Email: email, Password: "hunter2222", Name: "Settings Owner",
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("signup: got status %d, body %s", rec.Code, rec.Body.String())
	}
	var signupResp authResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &signupResp); err != nil {
		t.Fatalf("decode signup response: %v", err)
	}

	slug = "test-settings-" + uuid.NewString()[:8]
	rec = doJSON(t, handler, http.MethodPost, "/businesses", signupResp.AccessToken, createBusinessRequest{
		Slug: slug, Name: "Settings Test Biz",
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("create business: got status %d, body %s", rec.Code, rec.Body.String())
	}
	return signupResp.AccessToken, slug
}

func TestUpdateBusiness_GeneralSettings(t *testing.T) {
	handler, cleanup := newTestServer(t)
	defer cleanup()

	token, slug := signupAndCreateBusiness(t, handler)

	newTagline := "Best coffee in town"
	rec := doJSON(t, handler, http.MethodPatch, "/businesses/"+slug, token, map[string]any{
		"tagline":   newTagline,
		"is_active": false,
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("update business: got status %d, body %s", rec.Code, rec.Body.String())
	}
	var out businessOut
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if out.Tagline != newTagline {
		t.Fatalf("tagline: got %q, want %q", out.Tagline, newTagline)
	}
	if out.IsActive {
		t.Fatalf("is_active: got true, want false")
	}
	if out.Name != "Settings Test Biz" {
		t.Fatalf("name should be unchanged: got %q", out.Name)
	}

	// A stranger has no access.
	strangerToken, _ := signupAndCreateBusiness(t, handler)
	rec = doJSON(t, handler, http.MethodPatch, "/businesses/"+slug, strangerToken, map[string]any{"tagline": "hijacked"})
	if rec.Code != http.StatusForbidden {
		t.Fatalf("stranger update: got status %d, want 403", rec.Code)
	}
}

func TestOnboarding_CompletesAndSeedsAIRules(t *testing.T) {
	handler, cleanup := newTestServer(t)
	defer cleanup()

	token, slug := signupAndCreateBusiness(t, handler)

	// Missing required fields is rejected.
	rec := doJSON(t, handler, http.MethodPatch, "/businesses/"+slug+"/onboarding", token, onboardingRequest{})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("empty onboarding: got status %d, want 400", rec.Code)
	}

	rec = doJSON(t, handler, http.MethodPatch, "/businesses/"+slug+"/onboarding", token, onboardingRequest{
		BusinessType: "cafe", PrimaryUseCase: "orders", Language: "en",
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("onboarding: got status %d, body %s", rec.Code, rec.Body.String())
	}
	var out onboardingResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if !out.Business.OnboardingCompleted {
		t.Fatal("expected onboarding_completed = true")
	}
	if out.Business.BusinessType != "cafe" {
		t.Fatalf("business_type: got %q, want cafe", out.Business.BusinessType)
	}
	if out.AIRules.Language != "en" {
		t.Fatalf("ai_rules language: got %q, want en", out.AIRules.Language)
	}
	if out.AIRules.Personality == "" || out.AIRules.ToolInstructions == "" {
		t.Fatal("expected a non-empty seeded personality and tool_instructions")
	}
}

func TestCheckSlug_AvailabilityAndSuggestions(t *testing.T) {
	handler, cleanup := newTestServer(t)
	defer cleanup()

	token, slug := signupAndCreateBusiness(t, handler)

	rec := doJSON(t, handler, http.MethodGet, "/businesses/check-slug?slug="+slug, token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("check-slug taken: got status %d, body %s", rec.Code, rec.Body.String())
	}
	var taken struct {
		Available   bool     `json:"available"`
		Suggestions []string `json:"suggestions"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &taken); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if taken.Available {
		t.Fatal("expected taken slug to report available=false")
	}
	if len(taken.Suggestions) == 0 {
		t.Fatal("expected at least one suggestion for a taken slug")
	}

	fresh := "brand-new-" + uuid.NewString()[:8]
	rec = doJSON(t, handler, http.MethodGet, "/businesses/check-slug?slug="+fresh, token, nil)
	var avail struct {
		Available bool `json:"available"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &avail); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if !avail.Available {
		t.Fatal("expected fresh slug to report available=true")
	}

	// A reserved slug is always invalid.
	rec = doJSON(t, handler, http.MethodGet, "/businesses/check-slug?slug=settings", token, nil)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("reserved slug: got status %d, want 400", rec.Code)
	}
}

func TestPayment_QRUploadAndPublicRead(t *testing.T) {
	handler, cleanup := newTestServer(t)
	defer cleanup()

	token, slug := signupAndCreateBusiness(t, handler)

	// No QR configured yet: public read returns empty.
	rec := doJSON(t, handler, http.MethodGet, "/businesses/"+slug+"/payment", "", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("get payment: got status %d, body %s", rec.Code, rec.Body.String())
	}
	var out paymentOut
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if out.PaymentQRURL != "" {
		t.Fatalf("expected empty payment_qr_url, got %q", out.PaymentQRURL)
	}

	// Upload without R2 configured (this test environment) reports
	// storage_unavailable rather than a silent success — confirms the
	// gate fires; a full upload round-trip needs R2_* env vars, same
	// posture as photomoment's branding upload test.
	rec = doJSON(t, handler, http.MethodPost, "/businesses/"+slug+"/payment/qr", token, nil)
	if rec.Code != http.StatusServiceUnavailable && rec.Code != http.StatusBadRequest {
		t.Fatalf("upload without multipart/storage: got status %d, body %s", rec.Code, rec.Body.String())
	}
}

func TestAppearance_GetUpdate(t *testing.T) {
	handler, cleanup := newTestServer(t)
	defer cleanup()

	token, slug := signupAndCreateBusiness(t, handler)

	rec := doJSON(t, handler, http.MethodGet, "/businesses/"+slug+"/appearance", token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("get appearance: got status %d, body %s", rec.Code, rec.Body.String())
	}
	var out appearanceOut
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if out.DisplayOrientation != "landscape" {
		t.Fatalf("default orientation: got %q, want landscape", out.DisplayOrientation)
	}

	rec = doJSON(t, handler, http.MethodPatch, "/businesses/"+slug+"/appearance", token, updateAppearanceRequest{
		GradientColor: strPtr("#FF00AA"), DisplayOrientation: strPtr("portrait"),
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("update appearance: got status %d, body %s", rec.Code, rec.Body.String())
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if out.GradientColor != "#FF00AA" {
		t.Fatalf("gradient_color: got %q, want #FF00AA", out.GradientColor)
	}
	if out.DisplayOrientation != "portrait" {
		t.Fatalf("display_orientation: got %q, want portrait", out.DisplayOrientation)
	}

	// An invalid orientation is rejected.
	rec = doJSON(t, handler, http.MethodPatch, "/businesses/"+slug+"/appearance", token, updateAppearanceRequest{
		DisplayOrientation: strPtr("sideways"),
	})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("invalid orientation: got status %d, want 400", rec.Code)
	}

	// A malformed gradient color silently clears rather than erroring.
	rec = doJSON(t, handler, http.MethodPatch, "/businesses/"+slug+"/appearance", token, updateAppearanceRequest{
		GradientColor: strPtr("not-a-color"),
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("malformed gradient: got status %d, want 200", rec.Code)
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if out.GradientColor != "" {
		t.Fatalf("malformed gradient should clear the field, got %q", out.GradientColor)
	}
}

func TestUpdateMe_SetsCountryOnce(t *testing.T) {
	handler, cleanup := newTestServer(t)
	defer cleanup()

	token, _ := signupAndCreateBusiness(t, handler)

	rec := doJSON(t, handler, http.MethodPatch, "/auth/me", token, updateMeRequest{Country: strPtr("ID")})
	if rec.Code != http.StatusOK {
		t.Fatalf("update me: got status %d, body %s", rec.Code, rec.Body.String())
	}
	var out userOut
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if out.Country != "ID" {
		t.Fatalf("country: got %q, want ID", out.Country)
	}

	// A second attempt to change it is a no-op (matches legacy: this is a
	// one-time signup-flow field, not an editable setting).
	rec = doJSON(t, handler, http.MethodPatch, "/auth/me", token, updateMeRequest{Country: strPtr("US")})
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if out.Country != "ID" {
		t.Fatalf("country should stay locked at ID, got %q", out.Country)
	}

	// Malformed country code is rejected for a user that hasn't set one yet.
	token2, _ := signupAndCreateBusiness(t, handler)
	rec = doJSON(t, handler, http.MethodPatch, "/auth/me", token2, updateMeRequest{Country: strPtr("USA")})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("malformed country: got status %d, want 400", rec.Code)
	}
}

func strPtr(s string) *string { return &s }
