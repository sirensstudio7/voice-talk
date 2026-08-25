// Package promptkit holds pure, dependency-free text/lookup logic shared
// between the knowledge module (ai_rules defaults, admin-facing) and the
// streaming module (Gemini Live system-instruction compiler) — the same
// "extract once a second consumer needs it" pattern internal/capabilities
// already established for booking+streaming.
package promptkit

import "strings"

// DefaultPersonality ports apps-legacy/server/src/services/onboarding.ts's
// defaultAssistantPersonality — the fallback assistant_name-aware
// persona text ai_rules is seeded with the first time a business's rules
// are read, before the owner customizes it.
func DefaultPersonality(businessName, language, primaryUseCase, businessType, assistantName string) string {
	name := strings.TrimSpace(businessName)
	if name == "" {
		if language == "en" {
			name = "this business"
		} else {
			name = "bisnis ini"
		}
	}
	assistant := strings.TrimSpace(assistantName)

	role := "cashier"
	switch {
	case businessType == "salon" || primaryUseCase == "appointments":
		role = "receptionist"
	case primaryUseCase == "faqs":
		role = "faq"
	}

	if language == "en" {
		switch role {
		case "faq":
			if assistant != "" {
				return "You are " + assistant + ", a friendly AI customer service agent for " + name + ". Answer questions clearly using the business knowledge base. Do not take food or coffee orders, push menu items, or invent products. Stay focused on this organization's services and policies."
			}
			return "You are a friendly AI customer service agent for " + name + ". Answer questions clearly using the business knowledge base. Do not take food or coffee orders, push menu items, or invent products. Stay focused on this organization's services and policies."
		case "receptionist":
			if assistant != "" {
				return "You are " + assistant + ", a friendly AI receptionist for " + name + ". Help with services, schedules, and appointments. Be warm, concise, and helpful."
			}
			return "You are a friendly AI receptionist for " + name + ". Help with services, schedules, and appointments. Be warm, concise, and helpful."
		default:
			if assistant != "" {
				return "You are " + assistant + ", a friendly AI cashier for " + name + ". Be warm, concise, and helpful when taking orders."
			}
			return "You are a friendly AI cashier for " + name + ". Be warm, concise, and helpful when taking orders."
		}
	}

	switch role {
	case "faq":
		if assistant != "" {
			return "Kamu adalah " + assistant + ", agen layanan pelanggan AI yang ramah di " + name + ". Jawab pertanyaan dengan jelas menggunakan basis pengetahuan bisnis. Jangan menerima pesanan makanan/kopi, menawarkan menu, atau mengarang produk. Fokus pada layanan dan kebijakan organisasi ini."
		}
		return "Kamu adalah agen layanan pelanggan AI yang ramah di " + name + ". Jawab pertanyaan dengan jelas menggunakan basis pengetahuan bisnis. Jangan menerima pesanan makanan/kopi, menawarkan menu, atau mengarang produk. Fokus pada layanan dan kebijakan organisasi ini."
	case "receptionist":
		if assistant != "" {
			return "Kamu adalah " + assistant + ", resepsionis AI yang ramah di " + name + ". Bantu layanan, jadwal, dan appointment. Bersikap hangat, ringkas, dan membantu."
		}
		return "Kamu adalah resepsionis AI yang ramah di " + name + ". Bantu layanan, jadwal, dan appointment. Bersikap hangat, ringkas, dan membantu."
	default:
		if assistant != "" {
			return "Kamu adalah " + assistant + ", kasir AI yang ramah di " + name + ". Bersikap hangat, ringkas, dan membantu saat menerima pesanan."
		}
		return "Kamu adalah kasir AI yang ramah di " + name + ". Bersikap hangat, ringkas, dan membantu saat menerima pesanan."
	}
}

// allowedIdleTimeoutSeconds mirrors config-builder.ts's
// ALLOWED_IDLE_TIMEOUT_SECONDS — idle_timeout_seconds must be one of
// these or it silently falls back to DefaultIdleTimeoutSeconds, exactly
// as the legacy app does.
var allowedIdleTimeoutSeconds = map[int32]bool{0: true, 15: true, 30: true, 60: true, 90: true, 120: true}

const DefaultIdleTimeoutSeconds = 30

func NormalizeIdleTimeoutSeconds(seconds int32) int32 {
	if allowedIdleTimeoutSeconds[seconds] {
		return seconds
	}
	return DefaultIdleTimeoutSeconds
}

// Ported from packages/shared/src/voice-presets.ts's VOICE_PRESETS /
// VOICE_GENDERS + normalize functions — a value outside this fixed set
// silently falls back to the default rather than erroring, matching the
// legacy app (voice presets are UI dropdown values, not open text).
var validVoicePresets = map[string]bool{"natural": true, "dark_beast": true, "deep": true, "robot": true, "bright": true}

func NormalizeVoicePreset(preset string) string {
	if validVoicePresets[preset] {
		return preset
	}
	return "natural"
}

func NormalizeVoiceGender(gender string) string {
	if gender == "male" {
		return "male"
	}
	return "female"
}
