package platformadmin

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/httpx"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/platform/authtoken"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/tenantlifecycle"
)

// customerTokenTTL is fixed here rather than threaded through Deps —
// impersonation is a support/debug action, not a normal login, so it
// doesn't need to track JWT_EXPIRE_HOURS; a short, fixed window is the
// more conservative default for a token minted by staff on someone
// else's behalf.
const impersonationTokenTTL = 2 * time.Hour

func (m *Module) listBusinesses(w http.ResponseWriter, r *http.Request) {
	limit, offset := paginationParams(r)
	search := pgTextArg(r.URL.Query().Get("q"))

	businesses, err := m.store.ListBusinessesForPlatform(r.Context(), store.ListBusinessesForPlatformParams{Limit: limit, Offset: offset, Search: search})
	if err != nil {
		m.deps.Log.Error().Err(err).Msg("platformadmin: list businesses")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load businesses")
		return
	}

	items := make([]businessOut, len(businesses))
	for i, b := range businesses {
		items[i] = toBusinessOut(b)
	}
	httpx.List(w, http.StatusOK, items)
}

func (m *Module) getBusiness(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	ctx := r.Context()

	business, err := m.store.GetBusinessByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "business_not_found", "business not found")
			return
		}
		m.deps.Log.Error().Err(err).Str("business_id", id).Msg("platformadmin: get business")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load business")
		return
	}

	memberCount, err := m.store.GetBusinessMemberCount(ctx, id)
	if err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", id).Msg("platformadmin: count business members")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load business")
		return
	}
	productCount, err := m.store.GetBusinessProductCount(ctx, id)
	if err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", id).Msg("platformadmin: count business products")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load business")
		return
	}
	presentationCount, err := m.store.GetBusinessPresentationCount(ctx, id)
	if err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", id).Msg("platformadmin: count business presentations")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load business")
		return
	}
	aiRulesConfigured, err := m.store.HasAIRulesConfigured(ctx, id)
	if err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", id).Msg("platformadmin: check ai rules configured")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load business")
		return
	}
	memberRows, err := m.store.ListBusinessMembersForPlatform(ctx, id)
	if err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", id).Msg("platformadmin: list business members")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load business")
		return
	}
	members := make([]businessMemberOut, len(memberRows))
	for i, mb := range memberRows {
		members[i] = businessMemberOut{UserID: mb.UserID, Email: mb.Email, Name: mb.Name, Role: mb.Role}
	}

	httpx.JSON(w, http.StatusOK, businessDetailOut{
		businessOut: toBusinessOut(business), MemberCount: memberCount, ProductCount: productCount,
		PresentationCount: presentationCount, AIRulesConfigured: aiRulesConfigured, Members: members,
	})
}

func (m *Module) updateBusinessStatus(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.PlatformAccessFromContext(r.Context())
	id := chi.URLParam(r, "id")

	var req updateBusinessStatusRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "invalid request body")
		return
	}

	updated, err := m.store.UpdateBusinessStatus(r.Context(), store.UpdateBusinessStatusParams{ID: id, IsActive: req.IsActive})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "business_not_found", "business not found")
			return
		}
		m.deps.Log.Error().Err(err).Str("business_id", id).Msg("platformadmin: update business status")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to update business")
		return
	}

	m.writeAuditLog(r.Context(), access.AdminID, "business.status_updated", "business", id, map[string]any{"is_active": req.IsActive})
	httpx.JSON(w, http.StatusOK, toBusinessOut(updated))
}

func (m *Module) impersonateBusiness(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.PlatformAccessFromContext(r.Context())
	id := chi.URLParam(r, "id")
	ctx := r.Context()

	business, err := m.store.GetBusinessByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "business_not_found", "business not found")
			return
		}
		m.deps.Log.Error().Err(err).Str("business_id", id).Msg("platformadmin: get business for impersonation")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to impersonate")
		return
	}

	ownerUserID, err := m.store.GetBusinessOwnerUserID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusConflict, "no_members", "this business has no members to impersonate")
			return
		}
		m.deps.Log.Error().Err(err).Str("business_id", id).Msg("platformadmin: resolve business owner")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to impersonate")
		return
	}

	owner, err := m.store.GetUserByID(ctx, ownerUserID)
	if err != nil {
		m.deps.Log.Error().Err(err).Str("user_id", ownerUserID).Msg("platformadmin: get impersonation target user")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to impersonate")
		return
	}
	if owner.Status != "active" {
		httpx.Error(w, http.StatusConflict, "user_not_active", "the business owner's account is not active")
		return
	}

	token, err := authtoken.Issue(m.deps.JWTSecret, owner.ID, impersonationTokenTTL)
	if err != nil {
		m.deps.Log.Error().Err(err).Msg("platformadmin: issue impersonation token")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to impersonate")
		return
	}

	redirectURL := ""
	if m.deps.MerchantAdminURL != "" {
		redirectURL = m.deps.MerchantAdminURL + "/" + business.Slug
	}

	m.writeAuditLog(r.Context(), access.AdminID, "business.impersonated", "business", id, map[string]any{"impersonated_user_id": owner.ID})
	httpx.JSON(w, http.StatusOK, impersonateResponse{
		AccessToken: token, UserID: owner.ID, BusinessSlug: business.Slug, RedirectURL: redirectURL,
	})
}

// deleteBusiness requires the caller to pass the business's exact current
// slug as a fat-finger guard — a deliberate addition over legacy for an
// irreversible action (see the Phase 1 plan).
func (m *Module) deleteBusiness(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.PlatformAccessFromContext(r.Context())
	id := chi.URLParam(r, "id")
	ctx := r.Context()

	business, err := m.store.GetBusinessByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "business_not_found", "business not found")
			return
		}
		m.deps.Log.Error().Err(err).Str("business_id", id).Msg("platformadmin: get business for delete")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to delete business")
		return
	}

	var req deleteBusinessRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ConfirmSlug != business.Slug {
		httpx.Error(w, http.StatusBadRequest, "confirmation_mismatch", "confirm_slug must exactly match the business's slug")
		return
	}

	if err := tenantlifecycle.DeleteBusiness(ctx, m.deps.DB, m.deps.Storage, m.deps.Log, id); err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", id).Msg("platformadmin: delete business")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to delete business")
		return
	}

	m.writeAuditLog(ctx, access.AdminID, "business.deleted", "business", id, map[string]any{"slug": business.Slug, "name": business.Name})
	httpx.NoContent(w)
}
