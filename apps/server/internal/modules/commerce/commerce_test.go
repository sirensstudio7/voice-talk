package commerce

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
// same convention as internal/modules/auth's test.
func newTestFixture(t *testing.T) (handler http.Handler, businessSlug, token string, cleanup func()) {
	t.Helper()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set; skipping commerce integration test")
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("connect to database: %v", err)
	}

	queries := store.New(pool)
	userID := uuid.NewString()
	if _, err := queries.CreateUser(ctx, store.CreateUserParams{
		ID: userID, Email: "commerce-" + userID[:8] + "@example.com",
		PasswordHash: "unused", Name: "Commerce Test Owner",
	}); err != nil {
		t.Fatalf("create fixture user: %v", err)
	}

	businessID := uuid.NewString()
	slug := "commerce-test-" + businessID[:8]
	if _, err := queries.CreateBusiness(ctx, store.CreateBusinessParams{
		ID: businessID, Slug: slug, Name: "Commerce Test Business",
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

func TestProductCRUD(t *testing.T) {
	handler, slug, token, cleanup := newTestFixture(t)
	defer cleanup()

	base := "/businesses/" + slug + "/products"

	// No token: rejected before it ever reaches the business lookup.
	rec := doJSON(t, handler, http.MethodGet, base+"/", "", nil)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("list without token: got status %d, want 401", rec.Code)
	}

	// Empty list initially.
	rec = doJSON(t, handler, http.MethodGet, base+"/", token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("list: got status %d, body %s", rec.Code, rec.Body.String())
	}

	// Create.
	rec = doJSON(t, handler, http.MethodPost, base+"/", token, createProductRequest{
		ProductID: "latte", Name: "Latte", Price: 25000, Category: "coffee",
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("create: got status %d, body %s", rec.Code, rec.Body.String())
	}
	var created productOut
	if err := json.Unmarshal(rec.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode create response: %v", err)
	}
	if created.IsActive != true || created.DurationMin != 30 {
		t.Fatalf("expected defaults applied, got %+v", created)
	}

	// Duplicate product_id conflicts.
	rec = doJSON(t, handler, http.MethodPost, base+"/", token, createProductRequest{
		ProductID: "latte", Name: "Latte 2", Price: 25000, Category: "coffee",
	})
	if rec.Code != http.StatusConflict {
		t.Fatalf("duplicate product_id: got status %d, want 409", rec.Code)
	}

	// It shows up in the list, wrapped in {"items": [...]}.
	rec = doJSON(t, handler, http.MethodGet, base+"/", token, nil)
	var listEnvelope struct {
		Items []productOut `json:"items"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &listEnvelope); err != nil {
		t.Fatalf("decode list response: %v", err)
	}
	if len(listEnvelope.Items) != 1 {
		t.Fatalf("expected 1 product, got %d", len(listEnvelope.Items))
	}

	// Partial update: only price changes, name is left alone.
	newPrice := 27000.0
	rec = doJSON(t, handler, http.MethodPatch, base+"/"+created.ID, token, updateProductRequest{
		Price: &newPrice,
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("update: got status %d, body %s", rec.Code, rec.Body.String())
	}
	var updated productOut
	if err := json.Unmarshal(rec.Body.Bytes(), &updated); err != nil {
		t.Fatalf("decode update response: %v", err)
	}
	if updated.Price != newPrice || updated.Name != "Latte" {
		t.Fatalf("expected only price to change, got %+v", updated)
	}

	// Update on a nonexistent product 404s.
	rec = doJSON(t, handler, http.MethodPatch, base+"/"+uuid.NewString(), token, updateProductRequest{Price: &newPrice})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("update missing product: got status %d, want 404", rec.Code)
	}

	// Delete.
	rec = doJSON(t, handler, http.MethodDelete, base+"/"+created.ID, token, nil)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("delete: got status %d, body %s", rec.Code, rec.Body.String())
	}
	if rec.Body.Len() != 0 {
		t.Fatalf("expected empty 204 body, got %q", rec.Body.String())
	}

	// Deleting again 404s.
	rec = doJSON(t, handler, http.MethodDelete, base+"/"+created.ID, token, nil)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("delete missing product: got status %d, want 404", rec.Code)
	}
}

func TestBusinessMembership_ForbiddenForOtherUsers(t *testing.T) {
	handler, slug, _, cleanup := newTestFixture(t)
	defer cleanup()

	strangerToken, err := authtoken.Issue(testJWTSecret, uuid.NewString(), time.Hour)
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}

	rec := doJSON(t, handler, http.MethodGet, "/businesses/"+slug+"/products/", strangerToken, nil)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("non-member access: got status %d, want 403", rec.Code)
	}
}

func TestBusinessMembership_NotFoundForUnknownSlug(t *testing.T) {
	handler, _, token, cleanup := newTestFixture(t)
	defer cleanup()

	rec := doJSON(t, handler, http.MethodGet, "/businesses/does-not-exist/products/", token, nil)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("unknown slug: got status %d, want 404", rec.Code)
	}
}
