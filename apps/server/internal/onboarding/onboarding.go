// Package onboarding holds pure slug-validation logic shared between
// business creation, the check-slug endpoint, and the onboarding-complete
// flow — ported from apps-legacy/server/src/services/onboarding.ts.
package onboarding

import (
	"regexp"
	"strings"
)

var slugPattern = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

// reservedSlugs must stay in sync with the legacy admin-app's
// RESERVED_ADMIN_SLUGS + BUSINESS_SCOPED_ROOTS — these are path segments
// the frontend routing already claims, so a business can't be given one
// as its slug.
var reservedSlugs = map[string]bool{
	"login": true, "signup": true, "onboarding": true, "billing": true,
	"workspaces": true, "transactions": true, "settings": true, "api": true,
	"_next": true, "analytics": true, "menu": true, "appointments": true,
	"schedule": true, "orders": true, "payment": true, "knowledge": true,
	"presentations": true, "sessions": true, "ai-rules": true,
	"vision-settings": true, "conversations": true, "appearance": true,
	"add-ons": true,
}

// IsValidSlug matches apps-legacy's isValidSlug: 1-100 chars, lowercase
// alphanumeric segments joined by single hyphens, and not a reserved
// frontend route.
func IsValidSlug(slug string) bool {
	return len(slug) > 0 && len(slug) <= 100 &&
		slugPattern.MatchString(slug) && !reservedSlugs[strings.ToLower(slug)]
}

// NameToSlug ports nameToSlug: lowercases, replaces runs of non-alphanumeric
// characters with a single hyphen, trims leading/trailing hyphens, and
// caps the result at 100 chars.
func NameToSlug(name string) string {
	lower := strings.ToLower(strings.TrimSpace(name))
	var b strings.Builder
	lastHyphen := false
	for _, r := range lower {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			lastHyphen = false
		} else if !lastHyphen && b.Len() > 0 {
			b.WriteByte('-')
			lastHyphen = true
		}
	}
	out := strings.TrimRight(b.String(), "-")
	if len(out) > 100 {
		out = out[:100]
	}
	return out
}

// SlugSuggestions ports slugSuggestions: a handful of deterministic
// variants of a taken base slug, filtered to only valid ones, capped at 3.
func SlugSuggestions(base string) []string {
	compact := strings.ReplaceAll(base, "-", "")
	candidates := []string{base + "-co", compact + "123", base + "-id"}
	seen := map[string]bool{}
	out := make([]string, 0, 3)
	for _, c := range candidates {
		if seen[c] || !IsValidSlug(c) {
			continue
		}
		seen[c] = true
		out = append(out, c)
		if len(out) == 3 {
			break
		}
	}
	return out
}
