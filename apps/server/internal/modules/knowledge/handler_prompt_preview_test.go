package knowledge

import (
	"encoding/json"
	"net/http"
	"testing"
)

func TestPromptPreview_ReturnsCompiledInstruction(t *testing.T) {
	handler, slug, token, cleanup := newTestFixture(t)
	defer cleanup()

	rec := doJSON(t, handler, http.MethodGet, "/businesses/"+slug+"/prompt-preview", token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("prompt-preview: got status %d, body %s", rec.Code, rec.Body.String())
	}
	var out struct {
		SystemInstruction string `json:"system_instruction"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if out.SystemInstruction == "" {
		t.Fatal("expected a non-empty system_instruction")
	}
}

func TestAvatarDelete_404sWithoutAIRulesRowYet(t *testing.T) {
	handler, slug, token, cleanup := newTestFixture(t)
	defer cleanup()

	// The fixture business has no ai_rules row yet (never GET/PATCHed) —
	// matches legacy's 404 rather than lazily creating one just to clear it.
	rec := doJSON(t, handler, http.MethodDelete, "/businesses/"+slug+"/ai-rules/avatar", token, nil)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("delete avatar with no ai_rules row: got status %d, want 404, body %s", rec.Code, rec.Body.String())
	}

	// Once ai_rules exists (lazily created by GET), delete succeeds and
	// clears an already-empty avatar_url.
	rec = doJSON(t, handler, http.MethodGet, "/businesses/"+slug+"/ai-rules", token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("get ai-rules: got status %d, body %s", rec.Code, rec.Body.String())
	}
	rec = doJSON(t, handler, http.MethodDelete, "/businesses/"+slug+"/ai-rules/avatar", token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("delete avatar: got status %d, body %s", rec.Code, rec.Body.String())
	}
	var out aiRulesOut
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if out.AvatarURL != "" {
		t.Fatalf("expected empty avatar_url, got %q", out.AvatarURL)
	}
}

func TestAvatarUpload_RequiresStorage(t *testing.T) {
	handler, slug, token, cleanup := newTestFixture(t)
	defer cleanup()

	rec := doJSON(t, handler, http.MethodPost, "/businesses/"+slug+"/ai-rules/avatar", token, nil)
	if rec.Code != http.StatusServiceUnavailable && rec.Code != http.StatusBadRequest {
		t.Fatalf("upload without storage/multipart: got status %d, body %s", rec.Code, rec.Body.String())
	}
}
