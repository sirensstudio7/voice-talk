package auth

import (
	"time"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

// userOut strips password_hash and other internal fields before a user
// row ever reaches a JSON response.
type userOut struct {
	ID      string `json:"id"`
	Email   string `json:"email"`
	Name    string `json:"name"`
	Country string `json:"country"`
}

func toUserOut(u store.User) userOut {
	return userOut{ID: u.ID, Email: u.Email, Name: u.Name, Country: u.Country}
}

type businessOut struct {
	ID                  string `json:"id"`
	Slug                string `json:"slug"`
	Name                string `json:"name"`
	Tagline             string `json:"tagline"`
	VoiceName           string `json:"voice_name"`
	GeminiModel         string `json:"gemini_model"`
	BackgroundURL       string `json:"background_url"`
	IsActive            bool   `json:"is_active"`
	OnboardingCompleted bool   `json:"onboarding_completed"`
	CreatedAt           string `json:"created_at"`
}

func toBusinessOut(b store.Business) businessOut {
	return businessOut{
		ID:                  b.ID,
		Slug:                b.Slug,
		Name:                b.Name,
		Tagline:             b.Tagline,
		VoiceName:           b.VoiceName,
		GeminiModel:         b.GeminiModel,
		BackgroundURL:       b.BackgroundUrl,
		IsActive:            b.IsActive,
		OnboardingCompleted: b.OnboardingCompleted,
		CreatedAt:           b.CreatedAt.Time.Format(time.RFC3339),
	}
}

// myBusinessOut is businessOut plus the caller's role in that business —
// what ListBusinessesForUser returns.
type myBusinessOut struct {
	businessOut
	Role string `json:"role"`
}

func toMyBusinessOut(row store.ListBusinessesForUserRow) myBusinessOut {
	return myBusinessOut{
		businessOut: businessOut{
			ID:                  row.ID,
			Slug:                row.Slug,
			Name:                row.Name,
			Tagline:             row.Tagline,
			VoiceName:           row.VoiceName,
			GeminiModel:         row.GeminiModel,
			BackgroundURL:       row.BackgroundUrl,
			IsActive:            row.IsActive,
			OnboardingCompleted: row.OnboardingCompleted,
			CreatedAt:           row.CreatedAt.Time.Format(time.RFC3339),
		},
		Role: row.Role,
	}
}
