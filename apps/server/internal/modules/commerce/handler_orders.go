package commerce

import (
	"net/http"
	"strconv"
	"time"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/httpx"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

type orderItemOut struct {
	ProductID string  `json:"product_id"`
	Name      string  `json:"name"`
	Price     float64 `json:"price"`
	Quantity  int32   `json:"quantity"`
	Subtotal  float64 `json:"subtotal"`
}

type orderOut struct {
	ID           string         `json:"id"`
	Status       string         `json:"status"`
	Total        float64        `json:"total"`
	CustomerName *string        `json:"customer_name"`
	CreatedAt    string         `json:"created_at"`
	ConfirmedAt  *string        `json:"confirmed_at"`
	Items        []orderItemOut `json:"items"`
}

func toOrderOut(o store.Order, items []store.OrderItem) orderOut {
	out := orderOut{
		ID:        o.ID,
		Status:    o.Status,
		Total:     o.Total,
		CreatedAt: o.CreatedAt.Time.UTC().Format(time.RFC3339),
		Items:     make([]orderItemOut, 0, len(items)),
	}
	if o.CustomerName.Valid {
		out.CustomerName = &o.CustomerName.String
	}
	if o.ConfirmedAt.Valid {
		s := o.ConfirmedAt.Time.UTC().Format(time.RFC3339)
		out.ConfirmedAt = &s
	}
	for _, it := range items {
		out.Items = append(out.Items, orderItemOut{
			ProductID: it.ProductID, Name: it.Name, Price: it.Price, Quantity: it.Quantity,
			Subtotal: roundCents(it.Price * float64(it.Quantity)),
		})
	}
	return out
}

func roundCents(v float64) float64 {
	return float64(int64(v*100+0.5)) / 100
}

// listOrders ports admin.ts's GET /admin/businesses/:businessId/orders —
// the most recent 200 orders, newest first, each with its line items.
// The optional ?date=YYYY-MM-DD&tz_offset=<minutes> filter is applied
// in-memory after that 200-row fetch, exactly matching legacy's
// behavior (including its quirk: a date outside the most recent 200
// orders' range won't show results, since the DB query itself has no
// date predicate).
func (m *Module) listOrders(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())

	rows, err := m.store.ListOrdersForBusiness(r.Context(), access.BusinessID)
	if err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", access.BusinessID).Msg("list orders")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load orders")
		return
	}

	if dateStr := r.URL.Query().Get("date"); dateStr != "" {
		tzOffsetMin := 0
		if v := r.URL.Query().Get("tz_offset"); v != "" {
			if parsed, err := strconv.Atoi(v); err == nil {
				tzOffsetMin = parsed
			}
		}
		day, err := time.Parse("2006-01-02", dateStr)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "invalid_request", "invalid date format. Use YYYY-MM-DD.")
			return
		}
		start := day.Add(time.Duration(tzOffsetMin) * time.Minute)
		end := start.Add(24 * time.Hour)
		filtered := rows[:0]
		for _, o := range rows {
			ts := o.CreatedAt.Time
			if !ts.Before(start) && ts.Before(end) {
				filtered = append(filtered, o)
			}
		}
		rows = filtered
	}

	orderIDs := make([]string, len(rows))
	for i, o := range rows {
		orderIDs[i] = o.ID
	}
	itemsByOrder := map[string][]store.OrderItem{}
	if len(orderIDs) > 0 {
		items, err := m.store.ListOrderItemsForOrders(r.Context(), orderIDs)
		if err != nil {
			m.deps.Log.Error().Err(err).Str("business_id", access.BusinessID).Msg("list order items")
			httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load orders")
			return
		}
		for _, it := range items {
			itemsByOrder[it.OrderID] = append(itemsByOrder[it.OrderID], it)
		}
	}

	out := make([]orderOut, 0, len(rows))
	for _, o := range rows {
		out = append(out, toOrderOut(o, itemsByOrder[o.ID]))
	}
	httpx.List(w, http.StatusOK, out)
}
