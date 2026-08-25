package authtoken

import (
	"net/http"
	"strings"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/httpx"
)

// RequireAuth returns chi/net-http middleware that verifies the request's
// Bearer token and attaches the authenticated user's ID to the request
// context, readable downstream via httpx.UserIDFromContext. It is a
// stateless factory over secret so every module needing auth (not just
// the auth module itself) can wire it directly:
// r.Use(authtoken.RequireAuth(deps.JWTSecret)).
//
// It does not check user status (suspended, pending) or business
// membership — those are richer checks with DB access, layered on top by
// the auth module's own handlers and internal/platform/authz.
func RequireAuth(secret string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			header := r.Header.Get("Authorization")
			token, ok := strings.CutPrefix(header, "Bearer ")
			if !ok || token == "" {
				httpx.Error(w, http.StatusUnauthorized, "not_authenticated", "not authenticated")
				return
			}

			userID, err := Parse(secret, token)
			if err != nil {
				httpx.Error(w, http.StatusUnauthorized, "invalid_token", "invalid or expired token")
				return
			}

			ctx := httpx.ContextWithUserID(r.Context(), userID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
