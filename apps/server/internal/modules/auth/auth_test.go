package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Every handler here goes through the real store, so this is an
// integration test against Postgres, not a pure unit test — skipped
// unless DATABASE_URL is set, same convention as
// internal/platform/meter's test.
func newTestServer(t *testing.T) (http.Handler, func()) {
	t.Helper()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set; skipping auth integration test")
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("connect to database: %v", err)
	}

	m := New(Deps{DB: pool, JWTSecret: "test-secret", JWTExpireHours: 1})
	r := chi.NewRouter()
	m.RegisterRoutes(r)

	return r, func() { pool.Close() }
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

func TestSignupLoginBusinessFlow(t *testing.T) {
	handler, cleanup := newTestServer(t)
	defer cleanup()

	email := "test-" + uuid.NewString()[:8] + "@example.com"

	// Signup.
	rec := doJSON(t, handler, http.MethodPost, "/auth/signup", "", signupRequest{
		Email: email, Password: "hunter2222", Name: "Test User",
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("signup: got status %d, body %s", rec.Code, rec.Body.String())
	}
	var signupResp authResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &signupResp); err != nil {
		t.Fatalf("decode signup response: %v", err)
	}
	if signupResp.AccessToken == "" {
		t.Fatal("signup: expected non-empty access token")
	}

	// Duplicate signup should fail.
	rec = doJSON(t, handler, http.MethodPost, "/auth/signup", "", signupRequest{
		Email: email, Password: "hunter2222",
	})
	if rec.Code != http.StatusConflict {
		t.Fatalf("duplicate signup: got status %d, want 409", rec.Code)
	}

	// Login with wrong password should fail.
	rec = doJSON(t, handler, http.MethodPost, "/auth/login", "", loginRequest{
		Email: email, Password: "wrong-password",
	})
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("bad login: got status %d, want 401", rec.Code)
	}

	// Login with correct credentials.
	rec = doJSON(t, handler, http.MethodPost, "/auth/login", "", loginRequest{
		Email: email, Password: "hunter2222",
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("login: got status %d, body %s", rec.Code, rec.Body.String())
	}
	var loginResp loginResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &loginResp); err != nil {
		t.Fatalf("decode login response: %v", err)
	}
	token := loginResp.AccessToken

	// /auth/me without a token is rejected.
	rec = doJSON(t, handler, http.MethodGet, "/auth/me", "", nil)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("me without token: got status %d, want 401", rec.Code)
	}

	// /auth/me with a token succeeds.
	rec = doJSON(t, handler, http.MethodGet, "/auth/me", token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("me: got status %d, body %s", rec.Code, rec.Body.String())
	}

	// Create a business.
	slug := "test-biz-" + uuid.NewString()[:8]
	rec = doJSON(t, handler, http.MethodPost, "/businesses", token, createBusinessRequest{
		Slug: slug, Name: "Test Business",
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("create business: got status %d, body %s", rec.Code, rec.Body.String())
	}

	// It shows up in the caller's business list.
	rec = doJSON(t, handler, http.MethodGet, "/businesses", token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("list businesses: got status %d, body %s", rec.Code, rec.Body.String())
	}
	var businessesEnvelope struct {
		Items []myBusinessOut `json:"items"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &businessesEnvelope); err != nil {
		t.Fatalf("decode businesses response: %v", err)
	}
	businesses := businessesEnvelope.Items
	found := false
	for _, b := range businesses {
		if b.Slug == slug && b.Role == "owner" {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected created business %q with role owner in list, got %+v", slug, businesses)
	}

	// It's also fetchable publicly by slug, no auth required.
	rec = doJSON(t, handler, http.MethodGet, "/businesses/"+slug, "", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("get business by slug: got status %d, body %s", rec.Code, rec.Body.String())
	}
}

func TestDeleteBusiness_OwnerOnlyWithConfirmSlug(t *testing.T) {
	handler, cleanup := newTestServer(t)
	defer cleanup()

	ownerEmail := "owner-" + uuid.NewString()[:8] + "@example.com"
	rec := doJSON(t, handler, http.MethodPost, "/auth/signup", "", signupRequest{
		Email: ownerEmail, Password: "hunter2222", Name: "Owner",
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("owner signup: got status %d, body %s", rec.Code, rec.Body.String())
	}
	var ownerResp authResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &ownerResp); err != nil {
		t.Fatalf("decode owner signup response: %v", err)
	}
	ownerToken := ownerResp.AccessToken

	staffEmail := "staff-" + uuid.NewString()[:8] + "@example.com"
	rec = doJSON(t, handler, http.MethodPost, "/auth/signup", "", signupRequest{
		Email: staffEmail, Password: "hunter2222", Name: "Staff",
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("staff signup: got status %d, body %s", rec.Code, rec.Body.String())
	}
	var staffResp authResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &staffResp); err != nil {
		t.Fatalf("decode staff signup response: %v", err)
	}
	staffToken := staffResp.AccessToken

	slug := "test-del-biz-" + uuid.NewString()[:8]
	rec = doJSON(t, handler, http.MethodPost, "/businesses", ownerToken, createBusinessRequest{
		Slug: slug, Name: "Deletable Business",
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("create business: got status %d, body %s", rec.Code, rec.Body.String())
	}

	// A non-owner (staff has no membership at all here, standing in for
	// "not the owner") is rejected.
	rec = doJSON(t, handler, http.MethodDelete, "/businesses/"+slug, staffToken, deleteBusinessRequest{
		ConfirmSlug: slug,
	})
	if rec.Code != http.StatusForbidden {
		t.Fatalf("non-member delete: got status %d, want 403, body %s", rec.Code, rec.Body.String())
	}

	// Owner with the wrong confirm_slug is rejected.
	rec = doJSON(t, handler, http.MethodDelete, "/businesses/"+slug, ownerToken, deleteBusinessRequest{
		ConfirmSlug: "not-the-right-slug",
	})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("wrong confirm_slug: got status %d, want 400, body %s", rec.Code, rec.Body.String())
	}

	// Owner with the correct confirm_slug succeeds.
	rec = doJSON(t, handler, http.MethodDelete, "/businesses/"+slug, ownerToken, deleteBusinessRequest{
		ConfirmSlug: slug,
	})
	if rec.Code != http.StatusNoContent {
		t.Fatalf("owner delete: got status %d, want 204, body %s", rec.Code, rec.Body.String())
	}

	// The business is really gone.
	rec = doJSON(t, handler, http.MethodGet, "/businesses/"+slug, "", nil)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("business after delete: got status %d, want 404", rec.Code)
	}
}
