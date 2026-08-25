// Package authtoken issues and parses HS256 JWT access tokens. It's the
// one place golang-jwt is imported — internal/modules/** call Issue/Parse
// rather than touching the JWT library directly, matching the vendor-SDK
// isolation convention in internal/modules/doc.go.
package authtoken

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

var (
	// ErrInvalidToken covers every parse/verify failure — expired,
	// malformed, wrong signature, or missing subject. Callers don't need
	// to distinguish these; they all mean "not authenticated."
	ErrInvalidToken = errors.New("authtoken: invalid or expired token")
)

// Issue creates a signed access token for userID, expiring after ttl.
func Issue(secret, userID string, ttl time.Duration) (string, error) {
	claims := jwt.RegisteredClaims{
		Subject:   userID,
		ExpiresAt: jwt.NewNumericDate(time.Now().Add(ttl)),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

// Parse verifies a signed access token and returns its subject (user ID).
func Parse(secret, tokenString string) (string, error) {
	claims := &jwt.RegisteredClaims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, ErrInvalidToken
		}
		return []byte(secret), nil
	})
	if err != nil || !token.Valid || claims.Subject == "" {
		return "", ErrInvalidToken
	}
	return claims.Subject, nil
}

// platformClaims carries the extra fields a platform-admin token needs
// beyond a plain customer token: the admin's role (for RBAC — see
// internal/modules/platformadmin/rbac.go) and typ, which distinguishes a
// short-lived "platform_pending" token (issued after password login,
// valid only for completing 2FA enrollment/verification) from a full
// "platform" session token.
type platformClaims struct {
	jwt.RegisteredClaims
	Role string `json:"role"`
	Typ  string `json:"typ"`
}

// IssuePlatformToken creates a signed platform-admin token for adminID,
// carrying role and typ ("platform_pending" or "platform").
func IssuePlatformToken(secret, adminID, role, typ string, ttl time.Duration) (string, error) {
	claims := platformClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   adminID,
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(ttl)),
		},
		Role: role,
		Typ:  typ,
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

// ParsePlatformToken verifies a signed platform-admin token and returns
// its admin ID, role, and typ.
func ParsePlatformToken(secret, tokenString string) (adminID, role, typ string, err error) {
	claims := &platformClaims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, ErrInvalidToken
		}
		return []byte(secret), nil
	})
	if err != nil || !token.Valid || claims.Subject == "" || claims.Typ == "" {
		return "", "", "", ErrInvalidToken
	}
	return claims.Subject, claims.Role, claims.Typ, nil
}
