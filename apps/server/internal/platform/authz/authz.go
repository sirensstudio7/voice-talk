// Package authz provides the business-membership authorization middleware
// every tenant-scoped module route uses. It must run after
// authtoken.RequireAuth in the middleware chain, since it reads the
// user ID that middleware attaches to the request context.
package authz

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/httpx"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

// RequireBusinessMember resolves the request's {slug} chi URL param to a
// business and verifies the authenticated user (set by a prior
// authtoken.RequireAuth) is a member, attaching the business ID and role
// to the context via httpx.ContextWithBusinessAccess for handlers to read
// with httpx.BusinessAccessFromContext — sparing every handler its own
// slug-to-business lookup.
func RequireBusinessMember(queries *store.Queries) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userID, ok := httpx.UserIDFromContext(r.Context())
			if !ok {
				httpx.Error(w, http.StatusUnauthorized, "not_authenticated", "not authenticated")
				return
			}

			slug := chi.URLParam(r, "slug")
			business, err := queries.GetBusinessBySlug(r.Context(), slug)
			if err != nil {
				if errors.Is(err, pgx.ErrNoRows) {
					httpx.Error(w, http.StatusNotFound, "business_not_found", "business not found")
					return
				}
				httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load business")
				return
			}

			role, err := queries.CheckBusinessMembership(r.Context(), store.CheckBusinessMembershipParams{
				UserID:     userID,
				BusinessID: business.ID,
			})
			if err != nil {
				if errors.Is(err, pgx.ErrNoRows) {
					httpx.Error(w, http.StatusForbidden, "forbidden", "no access to this business")
					return
				}
				httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to verify business access")
				return
			}

			ctx := httpx.ContextWithBusinessAccess(r.Context(), httpx.BusinessAccess{
				BusinessID: business.ID,
				Role:       role,
			})
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
