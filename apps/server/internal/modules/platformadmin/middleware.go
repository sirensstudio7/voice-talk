package platformadmin

import (
	"net/http"
	"strings"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/httpx"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/platform/authtoken"
)

const (
	tokenTypPending = "platform_pending"
	tokenTypFull    = "platform"
)

// requirePlatformAuth admits only a full ("platform" typ) token, attaching
// the caller's admin ID and role to the context. A pending token (issued
// after password login, before 2FA is complete) is rejected here — it's
// only valid against requirePendingAuth's routes.
func (m *Module) requirePlatformAuth(next http.Handler) http.Handler {
	return m.requireTyp(tokenTypFull, next)
}

// requirePendingAuth admits only a pending token — the narrow window
// between password login and completed 2FA verification.
func (m *Module) requirePendingAuth(next http.Handler) http.Handler {
	return m.requireTyp(tokenTypPending, next)
}

func (m *Module) requireTyp(want string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		token, ok := strings.CutPrefix(header, "Bearer ")
		if !ok || token == "" {
			httpx.Error(w, http.StatusUnauthorized, "not_authenticated", "not authenticated")
			return
		}

		adminID, role, typ, err := authtoken.ParsePlatformToken(m.deps.JWTSecret, token)
		if err != nil || typ != want {
			httpx.Error(w, http.StatusUnauthorized, "invalid_token", "invalid or expired token")
			return
		}

		ctx := httpx.ContextWithPlatformAccess(r.Context(), httpx.PlatformAccess{AdminID: adminID, Role: role})
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
