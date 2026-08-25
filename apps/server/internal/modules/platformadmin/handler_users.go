package platformadmin

import (
	"crypto/rand"
	"encoding/base32"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/httpx"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

var validUserStatuses = map[string]bool{"active": true, "pending": true, "suspended": true}

func (m *Module) listUsers(w http.ResponseWriter, r *http.Request) {
	limit, offset := paginationParams(r)
	search := pgTextArg(r.URL.Query().Get("q"))

	users, err := m.store.ListUsersForPlatform(r.Context(), store.ListUsersForPlatformParams{Limit: limit, Offset: offset, Search: search})
	if err != nil {
		m.deps.Log.Error().Err(err).Msg("platformadmin: list users")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load users")
		return
	}

	items := make([]userOut, len(users))
	for i, u := range users {
		items[i] = toUserOut(u)
	}
	httpx.List(w, http.StatusOK, items)
}

func (m *Module) getUser(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	user, err := m.store.GetUserByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "user_not_found", "user not found")
			return
		}
		m.deps.Log.Error().Err(err).Str("user_id", id).Msg("platformadmin: get user")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load user")
		return
	}

	rows, err := m.store.ListBusinessMembershipsForUser(r.Context(), id)
	if err != nil {
		m.deps.Log.Error().Err(err).Str("user_id", id).Msg("platformadmin: list user memberships")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load user")
		return
	}
	memberships := make([]membershipOut, len(rows))
	for i, mb := range rows {
		memberships[i] = membershipOut{BusinessID: mb.BusinessID, Slug: mb.Slug, Name: mb.Name, Role: mb.Role}
	}

	httpx.JSON(w, http.StatusOK, userDetailOut{userOut: toUserOut(user), Memberships: memberships})
}

func (m *Module) updateUserStatus(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.PlatformAccessFromContext(r.Context())
	id := chi.URLParam(r, "id")

	var req updateStatusRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || !validUserStatuses[req.Status] {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "status must be one of active, pending, suspended")
		return
	}

	updated, err := m.store.UpdateUserStatus(r.Context(), store.UpdateUserStatusParams{ID: id, Status: req.Status})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "user_not_found", "user not found")
			return
		}
		m.deps.Log.Error().Err(err).Str("user_id", id).Msg("platformadmin: update user status")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to update user")
		return
	}

	m.writeAuditLog(r.Context(), access.AdminID, "user.status_updated", "user", id, map[string]any{"status": req.Status})
	httpx.JSON(w, http.StatusOK, toUserOut(updated))
}

// resetUserPassword generates a fresh temporary password and returns it
// directly in the response — there's no email-delivery channel wired up
// (matches legacy's own documented MVP limitation), so the admin must
// relay it to the user out of band. Not silently hidden: flagged here and
// in the plan.
func (m *Module) resetUserPassword(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.PlatformAccessFromContext(r.Context())
	id := chi.URLParam(r, "id")

	if _, err := m.store.GetUserByID(r.Context(), id); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "user_not_found", "user not found")
			return
		}
		m.deps.Log.Error().Err(err).Str("user_id", id).Msg("platformadmin: get user for password reset")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to reset password")
		return
	}

	tempPassword, err := generateTempPassword()
	if err != nil {
		m.deps.Log.Error().Err(err).Msg("platformadmin: generate temp password")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to reset password")
		return
	}
	hash, err := hashPassword(tempPassword)
	if err != nil {
		m.deps.Log.Error().Err(err).Msg("platformadmin: hash temp password")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to reset password")
		return
	}
	if err := m.store.UpdateUserPasswordHash(r.Context(), store.UpdateUserPasswordHashParams{ID: id, PasswordHash: hash}); err != nil {
		m.deps.Log.Error().Err(err).Str("user_id", id).Msg("platformadmin: save reset password hash")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to reset password")
		return
	}

	m.writeAuditLog(r.Context(), access.AdminID, "user.password_reset", "user", id, nil)
	httpx.JSON(w, http.StatusOK, resetPasswordResponse{TemporaryPassword: tempPassword})
}

func generateTempPassword() (string, error) {
	buf := make([]byte, 15)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(buf), nil
}

func paginationParams(r *http.Request) (limit, offset int32) {
	limit, offset = 20, 0
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := parsePositiveInt(v); err == nil {
			limit = min(n, 100)
		}
	}
	if v := r.URL.Query().Get("offset"); v != "" {
		if n, err := parsePositiveInt(v); err == nil {
			offset = n
		}
	}
	return limit, offset
}

func parsePositiveInt(s string) (int32, error) {
	n, err := strconv.Atoi(s)
	if err != nil || n < 0 {
		return 0, strconv.ErrSyntax
	}
	return int32(n), nil
}
