package knowledge

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/platform/authtoken"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

const testJWTSecret = "test-secret"

// Integration test against Postgres — skipped unless DATABASE_URL is set,
// same convention as internal/modules/auth and internal/modules/commerce.
func newTestFixture(t *testing.T) (handler http.Handler, businessSlug, token string, cleanup func()) {
	t.Helper()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set; skipping knowledge integration test")
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("connect to database: %v", err)
	}

	queries := store.New(pool)
	userID := uuid.NewString()
	if _, err := queries.CreateUser(ctx, store.CreateUserParams{
		ID: userID, Email: "knowledge-" + userID[:8] + "@example.com",
		PasswordHash: "unused", Name: "Knowledge Test Owner",
	}); err != nil {
		t.Fatalf("create fixture user: %v", err)
	}

	businessID := uuid.NewString()
	slug := "knowledge-test-" + businessID[:8]
	if _, err := queries.CreateBusiness(ctx, store.CreateBusinessParams{
		ID: businessID, Slug: slug, Name: "Knowledge Test Business",
	}); err != nil {
		t.Fatalf("create fixture business: %v", err)
	}
	if _, err := queries.CreateBusinessMember(ctx, store.CreateBusinessMemberParams{
		ID: uuid.NewString(), UserID: userID, BusinessID: businessID, Role: "owner",
	}); err != nil {
		t.Fatalf("create fixture membership: %v", err)
	}

	accessToken, err := authtoken.Issue(testJWTSecret, userID, time.Hour)
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}

	m := New(Deps{DB: pool, JWTSecret: testJWTSecret})
	r := chi.NewRouter()
	m.RegisterRoutes(r)

	return r, slug, accessToken, func() { pool.Close() }
}

func doJSON(t *testing.T, handler http.Handler, method, path, token string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&buf).Encode(body); err != nil {
			t.Fatalf("encode request body: %v", err)
		}
	}
	req := httptest.NewRequest(method, path, &buf)
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	return rec
}

func TestAIRules_GetOrCreateThenUpdate(t *testing.T) {
	handler, slug, token, cleanup := newTestFixture(t)
	defer cleanup()

	base := "/businesses/" + slug + "/ai-rules"

	// First GET lazily creates the row with a default persona.
	rec := doJSON(t, handler, http.MethodGet, base, token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("get ai rules: got status %d, body %s", rec.Code, rec.Body.String())
	}
	var rules aiRulesOut
	if err := json.Unmarshal(rec.Body.Bytes(), &rules); err != nil {
		t.Fatalf("decode ai rules: %v", err)
	}
	if rules.AssistantName != "Lorescale" || rules.Personality == "" {
		t.Fatalf("expected seeded defaults, got %+v", rules)
	}

	// Partial update: only assistant_name changes.
	newName := "Sasha"
	rec = doJSON(t, handler, http.MethodPatch, base, token, updateAIRulesRequest{AssistantName: &newName})
	if rec.Code != http.StatusOK {
		t.Fatalf("update ai rules: got status %d, body %s", rec.Code, rec.Body.String())
	}
	var updated aiRulesOut
	if err := json.Unmarshal(rec.Body.Bytes(), &updated); err != nil {
		t.Fatalf("decode updated ai rules: %v", err)
	}
	if updated.AssistantName != "Sasha" || updated.Personality != rules.Personality {
		t.Fatalf("expected only assistant_name to change, got %+v", updated)
	}

	// Invalid voice_preset silently normalizes rather than erroring.
	badPreset := "nonexistent-preset"
	rec = doJSON(t, handler, http.MethodPatch, base, token, updateAIRulesRequest{VoicePreset: &badPreset})
	if rec.Code != http.StatusOK {
		t.Fatalf("update with bad preset: got status %d, body %s", rec.Code, rec.Body.String())
	}
	var normalized aiRulesOut
	if err := json.Unmarshal(rec.Body.Bytes(), &normalized); err != nil {
		t.Fatalf("decode normalized ai rules: %v", err)
	}
	if normalized.VoicePreset != "natural" {
		t.Fatalf("expected invalid preset to normalize to natural, got %q", normalized.VoicePreset)
	}
}

func TestKnowledgeEntryCRUD(t *testing.T) {
	handler, slug, token, cleanup := newTestFixture(t)
	defer cleanup()

	base := "/businesses/" + slug + "/knowledge"

	// Create.
	rec := doJSON(t, handler, http.MethodPost, base+"/", token, createKnowledgeEntryRequest{
		Content: "We're open 9am-9pm every day.",
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("create: got status %d, body %s", rec.Code, rec.Body.String())
	}
	var created knowledgeEntryOut
	if err := json.Unmarshal(rec.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode create response: %v", err)
	}
	if created.Category != "General" {
		t.Fatalf("expected default category General, got %q", created.Category)
	}

	// Missing content is rejected.
	rec = doJSON(t, handler, http.MethodPost, base+"/", token, createKnowledgeEntryRequest{})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("create without content: got status %d, want 400", rec.Code)
	}

	// List, wrapped in {"items": [...]}.
	rec = doJSON(t, handler, http.MethodGet, base+"/", token, nil)
	var listEnvelope struct {
		Items []knowledgeEntryOut `json:"items"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &listEnvelope); err != nil {
		t.Fatalf("decode list response: %v", err)
	}
	if len(listEnvelope.Items) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(listEnvelope.Items))
	}

	// Partial update.
	newContent := "We're open 8am-10pm every day now."
	rec = doJSON(t, handler, http.MethodPatch, base+"/"+created.ID, token, updateKnowledgeEntryRequest{
		Content: &newContent,
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("update: got status %d, body %s", rec.Code, rec.Body.String())
	}
	var updated knowledgeEntryOut
	if err := json.Unmarshal(rec.Body.Bytes(), &updated); err != nil {
		t.Fatalf("decode update response: %v", err)
	}
	if updated.Content != newContent {
		t.Fatalf("expected content updated, got %+v", updated)
	}

	// Delete.
	rec = doJSON(t, handler, http.MethodDelete, base+"/"+created.ID, token, nil)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("delete: got status %d, body %s", rec.Code, rec.Body.String())
	}

	// Deleting again 404s.
	rec = doJSON(t, handler, http.MethodDelete, base+"/"+created.ID, token, nil)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("delete missing entry: got status %d, want 404", rec.Code)
	}
}

func TestKnowledgeEntry_DeleteAll(t *testing.T) {
	handler, slug, token, cleanup := newTestFixture(t)
	defer cleanup()

	base := "/businesses/" + slug + "/knowledge"
	for i := 0; i < 3; i++ {
		rec := doJSON(t, handler, http.MethodPost, base+"/", token, createKnowledgeEntryRequest{Content: "fact"})
		if rec.Code != http.StatusCreated {
			t.Fatalf("create: got status %d, body %s", rec.Code, rec.Body.String())
		}
	}

	rec := doJSON(t, handler, http.MethodDelete, base+"/", token, nil)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("delete all: got status %d, body %s", rec.Code, rec.Body.String())
	}

	rec = doJSON(t, handler, http.MethodGet, base+"/", token, nil)
	var listEnvelope struct {
		Items []knowledgeEntryOut `json:"items"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &listEnvelope); err != nil {
		t.Fatalf("decode list response: %v", err)
	}
	if len(listEnvelope.Items) != 0 {
		t.Fatalf("expected 0 entries after delete all, got %d", len(listEnvelope.Items))
	}
}
