package knowledge

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/httpx"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/promptkit"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

// getOrCreateAIRules returns the business's ai_rules row, seeding it with
// a sensible default persona (see persona.go) on first access — mirrors
// apps-legacy/server/src/routes/admin.ts's GET/PATCH ai-rules handlers,
// which both lazily create the row rather than requiring a separate
// "initialize" step.
func (m *Module) getOrCreateAIRules(ctx context.Context, businessID string) (store.AiRule, error) {
	rules, err := m.store.GetAIRules(ctx, businessID)
	if err == nil {
		return rules, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return store.AiRule{}, err
	}

	business, err := m.store.GetBusinessByID(ctx, businessID)
	if err != nil {
		return store.AiRule{}, err
	}

	personality := promptkit.DefaultPersonality(business.Name, "id", business.PrimaryUseCase, business.BusinessType, "Lorescale")
	return m.store.CreateAIRules(ctx, store.CreateAIRulesParams{
		ID:            uuid.NewString(),
		BusinessID:    businessID,
		AssistantName: "Lorescale",
		Personality:   personality,
		Tone:          "friendly",
	})
}

func (m *Module) getAIRules(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())

	rules, err := m.getOrCreateAIRules(r.Context(), access.BusinessID)
	if err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", access.BusinessID).Msg("get or create ai rules")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load ai rules")
		return
	}

	httpx.JSON(w, http.StatusOK, toAIRulesOut(rules))
}

func (m *Module) updateAIRules(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())

	if _, err := m.getOrCreateAIRules(r.Context(), access.BusinessID); err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", access.BusinessID).Msg("get or create ai rules")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to update ai rules")
		return
	}

	var req updateAIRulesRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "invalid request body")
		return
	}

	var voicePreset, voiceGender *string
	if req.VoicePreset != nil {
		v := promptkit.NormalizeVoicePreset(*req.VoicePreset)
		voicePreset = &v
	}
	if req.VoiceGender != nil {
		v := promptkit.NormalizeVoiceGender(*req.VoiceGender)
		voiceGender = &v
	}
	var idleTimeout *int32
	if req.IdleTimeoutSeconds != nil {
		v := promptkit.NormalizeIdleTimeoutSeconds(*req.IdleTimeoutSeconds)
		idleTimeout = &v
	}

	updated, err := m.store.UpdateAIRules(r.Context(), store.UpdateAIRulesParams{
		BusinessID:         access.BusinessID,
		AssistantName:      textArg(req.AssistantName),
		AvatarModelPath:    textArg(req.AvatarModelPath),
		Personality:        textArg(req.Personality),
		Tone:               textArg(req.Tone),
		Language:           textArg(req.Language),
		BehavioralRules:    textArg(req.BehavioralRules),
		ToolInstructions:   textArg(req.ToolInstructions),
		IdleTimeoutSeconds: int4Arg(idleTimeout),
		VoicePreset:        textArg(voicePreset),
		VoiceGender:        textArg(voiceGender),
	})
	if err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", access.BusinessID).Msg("update ai rules")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to update ai rules")
		return
	}

	httpx.JSON(w, http.StatusOK, toAIRulesOut(updated))
}
