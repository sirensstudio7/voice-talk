package commerce

import (
	"encoding/json"
	"net/http"
	"testing"
)

func TestListOrders_EmptyThenAfterConfirm(t *testing.T) {
	handler, slug, token, cleanup := newTestFixture(t)
	defer cleanup()

	rec := doJSON(t, handler, http.MethodPost, "/businesses/"+slug+"/products/", token, createProductRequest{
		ProductID: "espresso", Name: "Espresso", Price: 18000, Category: "coffee",
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("create product: got status %d, body %s", rec.Code, rec.Body.String())
	}

	rec = doJSON(t, handler, http.MethodGet, "/businesses/"+slug+"/orders", token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("list orders: got status %d, body %s", rec.Code, rec.Body.String())
	}
	var empty struct {
		Items []orderOut `json:"items"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &empty); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(empty.Items) != 0 {
		t.Fatalf("expected no orders yet, got %d", len(empty.Items))
	}

	// Confirm a public (non-voice) order.
	rec = doJSON(t, handler, http.MethodPost, "/businesses/"+slug+"/orders/confirm", "", confirmOrderRequest{
		Items: []struct {
			ProductID string `json:"product_id"`
			Quantity  int32  `json:"quantity"`
		}{{ProductID: "espresso", Quantity: 2}},
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("confirm order: got status %d, body %s", rec.Code, rec.Body.String())
	}
	var confirmed orderOut
	if err := json.Unmarshal(rec.Body.Bytes(), &confirmed); err != nil {
		t.Fatalf("decode confirm response: %v", err)
	}
	if confirmed.Total != 36000 {
		t.Fatalf("total: got %v, want 36000", confirmed.Total)
	}
	if len(confirmed.Items) != 1 || confirmed.Items[0].Quantity != 2 {
		t.Fatalf("unexpected items: %+v", confirmed.Items)
	}

	// Now it shows up in the owner's order list.
	rec = doJSON(t, handler, http.MethodGet, "/businesses/"+slug+"/orders", token, nil)
	var afterConfirm struct {
		Items []orderOut `json:"items"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &afterConfirm); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(afterConfirm.Items) != 1 {
		t.Fatalf("expected 1 order, got %d", len(afterConfirm.Items))
	}
	if afterConfirm.Items[0].ID != confirmed.ID {
		t.Fatalf("expected listed order to match confirmed order")
	}
}

func TestConfirmPublicOrder_ValidatesProducts(t *testing.T) {
	handler, slug, _, cleanup := newTestFixture(t)
	defer cleanup()

	// Unknown product is rejected.
	rec := doJSON(t, handler, http.MethodPost, "/businesses/"+slug+"/orders/confirm", "", confirmOrderRequest{
		Items: []struct {
			ProductID string `json:"product_id"`
			Quantity  int32  `json:"quantity"`
		}{{ProductID: "does-not-exist", Quantity: 1}},
	})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("unknown product: got status %d, want 400, body %s", rec.Code, rec.Body.String())
	}

	// Empty cart is rejected.
	rec = doJSON(t, handler, http.MethodPost, "/businesses/"+slug+"/orders/confirm", "", confirmOrderRequest{})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("empty cart: got status %d, want 400", rec.Code)
	}

	// Unknown business 404s.
	rec = doJSON(t, handler, http.MethodPost, "/businesses/does-not-exist/orders/confirm", "", confirmOrderRequest{})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("unknown business: got status %d, want 404", rec.Code)
	}
}
