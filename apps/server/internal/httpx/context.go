package httpx

import "context"

type contextKey int

const (
	userIDContextKey contextKey = iota
	businessAccessContextKey
	platformAccessContextKey
)

// ContextWithUserID attaches the authenticated user's ID to ctx. Called by
// authtoken.RequireAuth once a bearer token has been verified.
func ContextWithUserID(ctx context.Context, userID string) context.Context {
	return context.WithValue(ctx, userIDContextKey, userID)
}

// UserIDFromContext returns the authenticated user's ID set by
// authtoken.RequireAuth, and whether one was present.
func UserIDFromContext(ctx context.Context) (string, bool) {
	userID, ok := ctx.Value(userIDContextKey).(string)
	return userID, ok
}

// BusinessAccess is the {slug}-scoped business a request was authorized
// against, attached to the context by authz.RequireBusinessMember.
type BusinessAccess struct {
	BusinessID string
	Role       string
}

// ContextWithBusinessAccess attaches the caller's verified business
// membership to ctx. Called by authz.RequireBusinessMember.
func ContextWithBusinessAccess(ctx context.Context, access BusinessAccess) context.Context {
	return context.WithValue(ctx, businessAccessContextKey, access)
}

// BusinessAccessFromContext returns the business membership set by
// authz.RequireBusinessMember, and whether one was present.
func BusinessAccessFromContext(ctx context.Context) (BusinessAccess, bool) {
	access, ok := ctx.Value(businessAccessContextKey).(BusinessAccess)
	return access, ok
}

// PlatformAccess is the authenticated platform admin a request was
// authorized as, attached to the context by
// platformadmin's requirePlatformAuth middleware.
type PlatformAccess struct {
	AdminID string
	Role    string
}

// ContextWithPlatformAccess attaches the caller's verified platform-admin
// identity to ctx.
func ContextWithPlatformAccess(ctx context.Context, access PlatformAccess) context.Context {
	return context.WithValue(ctx, platformAccessContextKey, access)
}

// PlatformAccessFromContext returns the platform-admin identity set by
// requirePlatformAuth, and whether one was present.
func PlatformAccessFromContext(ctx context.Context) (PlatformAccess, bool) {
	access, ok := ctx.Value(platformAccessContextKey).(PlatformAccess)
	return access, ok
}
