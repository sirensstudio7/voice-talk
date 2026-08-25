package platformadmin

import (
	"net/http"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/httpx"
)

const recentSignupsLimit = 10

func (m *Module) getDashboard(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	totalUsers, err := m.store.CountUsersForPlatform(ctx, pgTextArg(""))
	if err != nil {
		m.deps.Log.Error().Err(err).Msg("platformadmin: count total users")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load dashboard")
		return
	}
	activeUsers, err := m.store.CountUsersByStatus(ctx, "active")
	if err != nil {
		m.deps.Log.Error().Err(err).Msg("platformadmin: count active users")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load dashboard")
		return
	}
	pendingUsers, err := m.store.CountUsersByStatus(ctx, "pending")
	if err != nil {
		m.deps.Log.Error().Err(err).Msg("platformadmin: count pending users")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load dashboard")
		return
	}
	suspendedUsers, err := m.store.CountUsersByStatus(ctx, "suspended")
	if err != nil {
		m.deps.Log.Error().Err(err).Msg("platformadmin: count suspended users")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load dashboard")
		return
	}
	totalBusinesses, err := m.store.CountBusinessesForPlatform(ctx, pgTextArg(""))
	if err != nil {
		m.deps.Log.Error().Err(err).Msg("platformadmin: count total businesses")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load dashboard")
		return
	}
	activeBusinesses, err := m.store.CountActiveBusinesses(ctx)
	if err != nil {
		m.deps.Log.Error().Err(err).Msg("platformadmin: count active businesses")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load dashboard")
		return
	}
	recent, err := m.store.ListRecentUserSignups(ctx, recentSignupsLimit)
	if err != nil {
		m.deps.Log.Error().Err(err).Msg("platformadmin: list recent signups")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load dashboard")
		return
	}

	signups := make([]userOut, len(recent))
	for i, u := range recent {
		signups[i] = toUserOut(u)
	}

	httpx.JSON(w, http.StatusOK, dashboardOut{
		TotalUsers: totalUsers, ActiveUsers: activeUsers, PendingUsers: pendingUsers, SuspendedUsers: suspendedUsers,
		TotalBusinesses: totalBusinesses, ActiveBusinesses: activeBusinesses, RecentSignups: signups,
	})
}
