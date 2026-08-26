package auth

import (
	"encoding/json"
	"net/http"
	"testing"
)

func TestMenu_UnknownBusinessAndMissingParam(t *testing.T) {
	handler, cleanup := newTestServer(t)
	defer cleanup()

	rec := doJSON(t, handler, http.MethodGet, "/menu", "", nil)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("missing business param: got status %d, want 400", rec.Code)
	}

	rec = doJSON(t, handler, http.MethodGet, "/menu?business=does-not-exist", "", nil)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("unknown business: got status %d, want 404", rec.Code)
	}
}

func TestMenu_ReturnsBootstrapPayload(t *testing.T) {
	handler, cleanup := newTestServer(t)
	defer cleanup()

	_, slug := signupAndCreateBusiness(t, handler)

	rec := doJSON(t, handler, http.MethodGet, "/menu?business="+slug, "", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("get menu: got status %d, body %s", rec.Code, rec.Body.String())
	}
	var out menuOut
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if out.Slug != slug {
		t.Fatalf("slug: got %q, want %q", out.Slug, slug)
	}
	if out.AssistantName != "Lorescale" {
		t.Fatalf("assistant_name default: got %q, want Lorescale", out.AssistantName)
	}
	if !out.Capabilities.OrderingEnabled {
		t.Fatal("expected ordering enabled by default (both use case, non-salon)")
	}
	if out.DisplayOrientation != "landscape" {
		t.Fatalf("display_orientation default: got %q, want landscape", out.DisplayOrientation)
	}
	if len(out.Products) != 0 {
		t.Fatalf("expected no products yet, got %d", len(out.Products))
	}
}
