package auth

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strings"

	"github.com/google/uuid"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/httpx"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

var slugPattern = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

func isValidSlug(slug string) bool {
	return len(slug) >= 3 && len(slug) <= 100 && slugPattern.MatchString(slug)
}

func (m *Module) listMyBusinesses(w http.ResponseWriter, r *http.Request) {
	userID, ok := httpx.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "not_authenticated", "not authenticated")
		return
	}

	businesses, err := m.store.ListBusinessesForUser(r.Context(), userID)
	if err != nil {
		m.deps.Log.Error().Err(err).Str("user_id", userID).Msg("list businesses for user")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load businesses")
		return
	}

	out := make([]myBusinessOut, 0, len(businesses))
	for _, b := range businesses {
		out = append(out, toMyBusinessOut(b))
	}
	httpx.List(w, http.StatusOK, out)
}

type createBusinessRequest struct {
	Slug string `json:"slug"`
	Name string `json:"name"`
}

// createBusiness makes the requesting user the owner of a brand-new
// workspace. There is no workspace-count limit — see
// project_pricing_not_decided memory: no plan/entitlement model exists
// yet, so every user may create as many businesses as they like until the
// business team defines pricing.
func (m *Module) createBusiness(w http.ResponseWriter, r *http.Request) {
	userID, ok := httpx.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "not_authenticated", "not authenticated")
		return
	}

	var req createBusinessRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "invalid request body")
		return
	}

	slug := strings.ToLower(strings.TrimSpace(req.Slug))
	name := strings.TrimSpace(req.Name)
	if !isValidSlug(slug) {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "invalid slug format")
		return
	}
	if name == "" {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "name is required")
		return
	}

	if _, err := m.store.GetBusinessBySlug(r.Context(), slug); err == nil {
		httpx.Error(w, http.StatusConflict, "slug_taken", "slug already exists")
		return
	}

	business, err := m.store.CreateBusiness(r.Context(), store.CreateBusinessParams{
		ID:   uuid.NewString(),
		Slug: slug,
		Name: name,
	})
	if err != nil {
		if isUniqueViolation(err) {
			httpx.Error(w, http.StatusConflict, "slug_taken", "slug already exists")
			return
		}
		m.deps.Log.Error().Err(err).Msg("create business")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to create business")
		return
	}

	if _, err := m.store.CreateBusinessMember(r.Context(), store.CreateBusinessMemberParams{
		ID:         uuid.NewString(),
		UserID:     userID,
		BusinessID: business.ID,
		Role:       "owner",
	}); err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", business.ID).Msg("create business member")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to create business")
		return
	}

	httpx.JSON(w, http.StatusCreated, toBusinessOut(business))
}
