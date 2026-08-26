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

// businessTypeLabel ports onboarding.ts's typeLabel lookup.
var businessTypeLabel = map[string]struct{ id, en string }{
	"restaurant": {"bisnis makanan dan minuman", "food & beverage business"},
	"cafe":       {"bisnis makanan dan minuman", "food & beverage business"},
	"retail":     {"toko retail", "retail store"},
	"salon":      {"salon", "salon"},
	"clinic":     {"fasilitas kesehatan", "healthcare facility"},
	"other":      {"bisnis", "business"},
}

// BuildOnboardingAIRules ports apps-legacy/server/src/services/onboarding.ts's
// buildOnboardingAiRules — the richer, business-type-aware persona +
// focus text generated once when an owner completes onboarding (distinct
// from DefaultPersonality, which is the simpler fallback used before
// onboarding / before ai_rules exists at all). Returns
// (personality, language, toolInstructions); language is always "id" or
// "en" (empty input normalizes to "id", matching the legacy default).
func BuildOnboardingAIRules(businessName, businessType, primaryUseCase, language string) (personality, lang, toolInstructions string) {
	if language != "en" {
		language = "id"
	}
	if primaryUseCase == "" {
		primaryUseCase = "both"
	}
	if businessType == "" {
		businessType = "other"
	}
	name := businessName

	role := "cashier"
	switch {
	case businessType == "salon" || primaryUseCase == "appointments":
		role = "receptionist"
	case primaryUseCase == "faqs":
		role = "faq"
	}

	label, ok := businessTypeLabel[businessType]
	if !ok {
		label = businessTypeLabel["other"]
	}

	if language == "en" {
		typeWord := label.en
		var focus string
		switch {
		case role == "receptionist" && primaryUseCase == "faqs":
			focus = "Focus on answering customer questions clearly using the business knowledge base."
		case role == "receptionist" && primaryUseCase == "appointments":
			focus = "Help customers choose a treatment, check available times, and book appointments. Confirm name and phone before booking."
		case role == "receptionist":
			focus = "Help customers book appointments and answer questions about services, hours, and policies."
		case role == "faq":
			focus = "Focus on answering customer questions clearly using the business knowledge base. Never take food or coffee orders."
		case primaryUseCase == "orders":
			focus = "Focus on taking customer orders accurately and confirming items before checkout."
		default:
			focus = "Help customers with questions and take orders when they are ready to buy."
		}

		var roleLine string
		switch role {
		case "faq":
			roleLine = "You are a friendly AI customer service agent for " + name + ", a " + typeWord + ". Speak in clear, natural English. Be warm, concise, and helpful. Do not invent a coffee shop or restaurant context."
		case "receptionist":
			roleLine = "You are a friendly AI receptionist for " + name + ", a " + typeWord + ". Speak in clear, natural English. Be warm, concise, and helpful."
		default:
			roleLine = "You are a friendly AI cashier for " + name + ", a " + typeWord + ". Speak in clear, natural English. Be warm, concise, and helpful."
		}

		return roleLine, "en", focus
	}

	typeWord := label.id
	var focus string
	switch {
	case role == "receptionist" && primaryUseCase == "faqs":
		focus = "Fokus menjawab pertanyaan pelanggan dengan jelas menggunakan basis pengetahuan bisnis."
	case role == "receptionist" && primaryUseCase == "appointments":
		focus = "Bantu pelanggan memilih treatment, cek jadwal kosong, dan buat appointment. Konfirmasi nama dan nomor telepon sebelum booking."
	case role == "receptionist":
		focus = "Bantu pelanggan membuat appointment dan jawab pertanyaan tentang layanan, jam buka, dan kebijakan salon."
	case role == "faq":
		focus = "Fokus menjawab pertanyaan pelanggan dengan jelas menggunakan basis pengetahuan bisnis. Jangan menerima pesanan makanan atau kopi."
	case primaryUseCase == "orders":
		focus = "Fokus pada menerima pesanan pelanggan dengan akurat dan mengonfirmasi item sebelum checkout."
	default:
		focus = "Bantu pelanggan dengan pertanyaan dan terima pesanan saat mereka siap membeli."
	}

	var roleLine string
	switch role {
	case "faq":
		roleLine = "Kamu adalah agen layanan pelanggan AI yang ramah di " + name + ", sebuah " + typeWord + ". Selalu berbicara dalam Bahasa Indonesia yang natural. Bersikap hangat, ringkas, dan membantu. Jangan mengarang konteks kafe, kopi, atau restoran."
	case "receptionist":
		roleLine = "Kamu adalah resepsionis AI yang ramah di " + name + ", sebuah " + typeWord + ". Selalu berbicara dalam Bahasa Indonesia yang natural. Bersikap hangat, ringkas, dan membantu."
	default:
		roleLine = "Kamu adalah kasir AI yang ramah di " + name + ", sebuah " + typeWord + ". Selalu berbicara dalam Bahasa Indonesia yang natural. Bersikap hangat, ringkas, dan membantu."
	}

	return roleLine, "id", focus
}
