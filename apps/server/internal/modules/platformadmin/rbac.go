package platformadmin

import (
	"net/http"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/httpx"
)

// Roles. "finance" is dropped from legacy's 5-role set — meaningless with
// no billing surface to gate (see the Phase 1 plan's scope cuts).
const (
	roleSuper    = "super"
	roleOps      = "ops"
	roleSupport  = "support"
	roleReadonly = "readonly"
)

// Permissions.
const (
	permDashboardRead   = "dashboard:read"
	permUsersRead       = "users:read"
	permUsersWrite      = "users:write"
	permBusinessesRead  = "businesses:read"
	permBusinessesWrite = "businesses:write"
	permImpersonate     = "impersonate"
	permAuditRead       = "audit:read"
)

// rolePermissions is the static role -> permission-set map every request
// is checked against. super has everything; each other role is an
// explicit subset — no wildcard/inheritance, so a new permission must be
// deliberately added to every role that should have it.
var rolePermissions = map[string]map[string]bool{
	roleSuper: {
		permDashboardRead: true, permUsersRead: true, permUsersWrite: true,
		permBusinessesRead: true, permBusinessesWrite: true, permImpersonate: true, permAuditRead: true,
	},
	roleOps: {
		permDashboardRead: true, permUsersRead: true, permUsersWrite: true,
		permBusinessesRead: true, permBusinessesWrite: true, permImpersonate: true, permAuditRead: true,
	},
	roleSupport: {
		permDashboardRead: true, permUsersRead: true, permBusinessesRead: true,
		permImpersonate: true, permAuditRead: true,
	},
	roleReadonly: {
		permDashboardRead: true, permUsersRead: true, permBusinessesRead: true, permAuditRead: true,
	},
}

func hasPermission(role, perm string) bool {
	return rolePermissions[role][perm]
}

// requirePermission returns middleware gating a route group on the
// caller's role (set by requirePlatformAuth, which must run first)
// carrying perm.
func (m *Module) requirePermission(perm string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			access, ok := httpx.PlatformAccessFromContext(r.Context())
			if !ok {
				httpx.Error(w, http.StatusUnauthorized, "not_authenticated", "not authenticated")
				return
			}
			if !hasPermission(access.Role, perm) {
				httpx.Error(w, http.StatusForbidden, "forbidden", "insufficient permissions")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
