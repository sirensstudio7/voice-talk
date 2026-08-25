package auth

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/httpx"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/tenantlifecycle"
)

type deleteBusinessRequest struct {
	ConfirmSlug string `json:"confirm_slug"`
}

// deleteBusiness lets a business's own owner permanently delete it —
// the self-service counterpart to platformadmin's admin-initiated hard
// delete, both backed by the same internal/tenantlifecycle.DeleteBusiness.
// Restricted to the owner role (not any member) and guarded by a
// {confirm_slug} fat-finger check matching platformadmin's pattern, since
// this is irreversible and, unlike the admin panel, reachable by any
// business's own staff if they were merely a member.
func (m *Module) deleteBusiness(w http.ResponseWriter, r *http.Request) {
	access, ok := httpx.BusinessAccessFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "not_authenticated", "not authenticated")
		return
	}
	if access.Role != "owner" {
		httpx.Error(w, http.StatusForbidden, "forbidden", "only the business owner can delete this workspace")
		return
	}

	var req deleteBusinessRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "invalid request body")
		return
	}

	slug := chi.URLParam(r, "slug")
	if req.ConfirmSlug != slug {
		httpx.Error(w, http.StatusBadRequest, "confirm_slug_mismatch", "confirm_slug does not match this business's slug")
		return
	}

	if err := tenantlifecycle.DeleteBusiness(r.Context(), m.deps.DB, m.deps.Storage, m.deps.Log, access.BusinessID); err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", access.BusinessID).Msg("owner-initiated business delete")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to delete business")
		return
	}

	httpx.NoContent(w)
}
