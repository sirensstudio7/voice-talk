package knowledge

import (
	"net/http"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/httpx"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/promptkit"
)

// promptPreview ports admin.ts's GET /admin/businesses/:businessId/prompt-preview
// — lets an owner see the exact compiled system instruction their voice
// assistant runs on, for debugging ai_rules/knowledge changes. Uses the
// same promptkit.BuildSystemInstruction the streaming module's Gemini
// provider does, so the preview never drifts from the real prompt.
func (m *Module) promptPreview(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())
	ctx := r.Context()

	business, err := m.store.GetBusinessByID(ctx, access.BusinessID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load business")
		return
	}
	rules, err := m.getOrCreateAIRules(ctx, access.BusinessID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load ai rules")
		return
	}
	entries, err := m.store.ListKnowledgeEntries(ctx, access.BusinessID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load knowledge entries")
		return
	}
	products, err := m.store.ListProductsForBusiness(ctx, access.BusinessID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load products")
		return
	}

	photoEnabled, photoVoicePrompt := false, ""
	if settings, err := m.store.GetPhotoSettings(ctx, access.BusinessID); err == nil {
		photoEnabled, photoVoicePrompt = settings.Enabled, settings.VoicePrompt
	}

	instruction := promptkit.BuildSystemInstruction(business, rules, entries, products, "", photoEnabled, photoVoicePrompt)
	httpx.JSON(w, http.StatusOK, map[string]string{"system_instruction": instruction})
}
