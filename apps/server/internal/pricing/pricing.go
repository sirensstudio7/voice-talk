// Package pricing ports apps-legacy/server/src/services/pricing.ts's
// effectivePrice — the one shared piece of discount math needed by both
// the streaming module's order tools and promptkit's menu prompt text.
package pricing

import "math"

// EffectivePrice returns price after discountPercent is applied,
// rounded to the nearest unit, matching legacy's
// Math.round(price * (1 - min(discountPercent, 100) / 100)).
func EffectivePrice(price, discountPercent float64) float64 {
	if discountPercent <= 0 {
		return price
	}
	if discountPercent > 100 {
		discountPercent = 100
	}
	return math.Round(price * (1 - discountPercent/100))
}
