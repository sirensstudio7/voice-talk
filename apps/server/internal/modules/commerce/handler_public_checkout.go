package commerce

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/capabilities"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/httpx"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/platform/events"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/pricing"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

type confirmOrderRequest struct {
	Items []struct {
		ProductID string `json:"product_id"`
		Quantity  int32  `json:"quantity"`
	} `json:"items"`
}

// confirmPublicOrder ports public.ts's POST /businesses/:slug/orders/confirm
// — the touch-only (non-voice) checkout path a kiosk uses when a customer
// builds their cart by tapping the menu instead of talking, validating
// against ListActiveProductsForBusiness (never trusting a client-sent
// price) exactly like the voice pipeline's confirm_order tool does.
func (m *Module) confirmPublicOrder(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	business, err := m.store.GetBusinessBySlug(r.Context(), slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "business_not_found", "business not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load business")
		return
	}

	caps := capabilities.Get(business.PrimaryUseCase, business.BusinessType)
	if !caps.OrderingEnabled {
		httpx.Error(w, http.StatusForbidden, "ordering_disabled", "ordering is not enabled for this business")
		return
	}

	var req confirmOrderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "invalid request body")
		return
	}

	products, err := m.store.ListActiveProductsForBusiness(r.Context(), business.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load products")
		return
	}
	productByID := make(map[string]store.Product, len(products))
	for _, p := range products {
		productByID[p.ProductID] = p
	}

	type validatedItem struct {
		product  store.Product
		quantity int32
	}
	validated := make([]validatedItem, 0, len(req.Items))
	var total float64
	for _, item := range req.Items {
		product, ok := productByID[item.ProductID]
		if !ok {
			httpx.Error(w, http.StatusBadRequest, "invalid_request", "product '"+item.ProductID+"' not found")
			return
		}
		validated = append(validated, validatedItem{product: product, quantity: item.Quantity})
		price := pricing.EffectivePrice(product.Price, product.DiscountPercent)
		total = roundCents(total + roundCents(price*float64(item.Quantity)))
	}
	if len(validated) == 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "cannot confirm an empty order")
		return
	}

	order, err := m.store.CreateOrder(r.Context(), store.CreateOrderParams{
		ID: uuid.NewString(), BusinessID: business.ID,
		VoiceSessionID: pgtype.Text{}, Total: total,
	})
	if err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", business.ID).Msg("create public order")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to confirm order")
		return
	}

	items := make([]store.OrderItem, 0, len(validated))
	for _, v := range validated {
		price := pricing.EffectivePrice(v.product.Price, v.product.DiscountPercent)
		item, err := m.store.CreateOrderItem(r.Context(), store.CreateOrderItemParams{
			ID: uuid.NewString(), OrderID: order.ID,
			ProductID: v.product.ProductID, Name: v.product.Name, Price: price, Quantity: v.quantity,
		})
		if err != nil {
			m.deps.Log.Error().Err(err).Str("order_id", order.ID).Msg("create public order item")
			httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to confirm order")
			return
		}
		items = append(items, item)
	}

	if m.deps.Events != nil {
		m.deps.Events.Publish(r.Context(), events.Event{Name: "order.confirmed", Data: order})
	}

	httpx.JSON(w, http.StatusOK, toOrderOut(order, items))
}
