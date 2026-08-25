package streaming

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/platform/events"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/pricing"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/scheduling"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

// ToolExecutor is the reusable tool-calling core: both debug.tool_call
// (a manual test/demo harness) and a real Gemini provider's parsed
// functionCalls dispatch through the same Execute entry point.
type ToolExecutor struct {
	store  *store.Queries
	events *events.Bus
}

func NewToolExecutor(q *store.Queries, bus *events.Bus) *ToolExecutor {
	return &ToolExecutor{store: q, events: bus}
}

var errUnknownTool = errors.New("unknown tool")

// Execute dispatches a named tool call with its arguments and returns a
// JSON-friendly result map. Errors are returned, not panicked — callers
// turn them into a WS error frame or a Gemini tool-response error.
func (t *ToolExecutor) Execute(ctx context.Context, sess *Session, name string, args map[string]any) (map[string]any, error) {
	switch name {
	case "search_products":
		return t.searchProducts(ctx, sess, args)
	case "add_to_order":
		return t.addToOrder(ctx, sess, args)
	case "decrement_item":
		return t.decrementItem(sess, args)
	case "remove_from_order":
		return t.removeFromOrder(ctx, sess, args)
	case "cancel_order":
		return t.cancelOrder(sess)
	case "get_order_summary":
		return t.getOrderSummary(sess)
	case "confirm_order":
		return t.confirmOrder(ctx, sess)
	case "set_customer_name":
		return t.setCustomerName(ctx, sess, args)
	case "prompt_payment":
		return t.promptPayment(ctx, sess)
	case "end_conversation":
		return map[string]any{"status": "ended"}, nil
	case "list_treatments":
		return t.listTreatments(ctx, sess)
	case "check_availability":
		return t.checkAvailability(ctx, sess, args)
	case "book_appointment":
		return t.bookAppointment(ctx, sess, args)
	case "cancel_appointment":
		return t.cancelAppointment(ctx, sess, args)
	default:
		return nil, fmt.Errorf("%w: %q", errUnknownTool, name)
	}
}

func stringArg(args map[string]any, key string) string {
	s, _ := args[key].(string)
	return s
}

func intArg(args map[string]any, key string, fallback int32) int32 {
	switch v := args[key].(type) {
	case float64: // encoding/json decodes JSON numbers as float64
		return int32(v)
	case int32:
		return v
	default:
		return fallback
	}
}

var errOrderingOnly = errors.New("this tool is only available in ordering mode")
var errBookingOnly = errors.New("this tool is only available in booking mode")

// --- Ordering tools ---

func (t *ToolExecutor) searchProducts(ctx context.Context, sess *Session, args map[string]any) (map[string]any, error) {
	query := strings.ToLower(strings.TrimSpace(stringArg(args, "query")))
	products, err := t.store.ListActiveProductsForBusiness(ctx, sess.business.ID)
	if err != nil {
		return nil, err
	}

	type result struct {
		ProductID       string   `json:"product_id"`
		Name            string   `json:"name"`
		Price           float64  `json:"price"`
		OriginalPrice   *float64 `json:"original_price,omitempty"`
		DiscountPercent float64  `json:"discount_percent"`
		Category        string   `json:"category"`
		Description     string   `json:"description"`
	}
	var results []result
	for _, p := range products {
		if query != "" && !productMatches(p, query) {
			continue
		}
		r := result{
			ProductID: p.ProductID, Name: p.Name,
			Price:           pricing.EffectivePrice(p.Price, p.DiscountPercent),
			DiscountPercent: p.DiscountPercent,
			Category:        p.Category, Description: p.Description,
		}
		if p.DiscountPercent > 0 {
			original := p.Price
			r.OriginalPrice = &original
		}
		results = append(results, r)
	}
	return map[string]any{"results": results, "count": len(results)}, nil
}

func productMatches(p store.Product, needle string) bool {
	return strings.Contains(strings.ToLower(p.Name), needle) ||
		strings.Contains(strings.ToLower(p.Category), needle) ||
		strings.Contains(strings.ToLower(p.Description), needle) ||
		strings.Contains(strings.ToLower(p.ProductID), needle)
}

func (t *ToolExecutor) addToOrder(ctx context.Context, sess *Session, args map[string]any) (map[string]any, error) {
	if sess.orderStore == nil {
		return nil, errOrderingOnly
	}
	productID := stringArg(args, "product_id")
	quantity := intArg(args, "quantity", 1)
	if productID == "" || quantity <= 0 {
		return nil, fmt.Errorf("product_id and a positive quantity are required")
	}

	product, err := t.store.GetActiveProductBySlug(ctx, store.GetActiveProductBySlugParams{
		BusinessID: sess.business.ID, ProductID: productID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, fmt.Errorf("product %q not found", productID)
		}
		return nil, err
	}

	price := pricing.EffectivePrice(product.Price, product.DiscountPercent)
	sess.orderStore.AddItem(product.ProductID, product.Name, price, quantity)
	return t.getOrderSummary(sess)
}

func (t *ToolExecutor) decrementItem(sess *Session, args map[string]any) (map[string]any, error) {
	if sess.orderStore == nil {
		return nil, errOrderingOnly
	}
	if !sess.orderStore.DecrementItem(stringArg(args, "product_id")) {
		return nil, fmt.Errorf("product %q is not in the order", stringArg(args, "product_id"))
	}
	return t.getOrderSummary(sess)
}

// removeFromOrder ports tools.ts's resolveRemoveProductId: the caller
// may pass an exact product id or a free-text item name, resolved
// against what's actually in the cart (and, as a fallback, the menu)
// before removing — Gemini often says "remove the cold brew", not the
// product's internal slug.
func (t *ToolExecutor) removeFromOrder(ctx context.Context, sess *Session, args map[string]any) (map[string]any, error) {
	if sess.orderStore == nil {
		return nil, errOrderingOnly
	}
	query := stringArg(args, "product_id")
	products, err := t.store.ListActiveProductsForBusiness(ctx, sess.business.ID)
	if err != nil {
		return nil, err
	}
	productID := resolveRemoveProductID(query, sess.orderStore, products)
	if productID == "" {
		return nil, fmt.Errorf("could not find %q in the current order", query)
	}
	quantity := intArg(args, "quantity", 0)
	if !sess.orderStore.Reduce(productID, quantity) {
		return nil, fmt.Errorf("product %q is not in the order", productID)
	}
	return t.getOrderSummary(sess)
}

func resolveRemoveProductID(query string, orderStore *OrderStore, products []store.Product) string {
	trimmed := strings.TrimSpace(query)
	if trimmed == "" {
		return ""
	}
	lines := orderStore.Snapshot()

	for _, l := range lines {
		if l.ProductID == trimmed {
			return trimmed
		}
	}

	needle := strings.ToLower(trimmed)
	var nameMatches []string
	for _, l := range lines {
		if strings.Contains(strings.ToLower(l.Name), needle) {
			nameMatches = append(nameMatches, l.ProductID)
		}
	}
	if len(nameMatches) == 1 {
		return nameMatches[0]
	}

	inOrder := make(map[string]bool, len(lines))
	for _, l := range lines {
		inOrder[l.ProductID] = true
	}
	var menuMatches []string
	for _, p := range products {
		if !inOrder[p.ProductID] || !productMatches(p, needle) {
			continue
		}
		menuMatches = append(menuMatches, p.ProductID)
	}
	if len(menuMatches) == 1 {
		return menuMatches[0]
	}
	return ""
}

func (t *ToolExecutor) cancelOrder(sess *Session) (map[string]any, error) {
	if sess.orderStore == nil {
		return nil, errOrderingOnly
	}
	sess.orderStore.Clear()
	return t.getOrderSummary(sess)
}

func (t *ToolExecutor) getOrderSummary(sess *Session) (map[string]any, error) {
	if sess.orderStore == nil {
		return nil, errOrderingOnly
	}
	lines := sess.orderStore.Snapshot()
	items := make([]orderLineOut, len(lines))
	for i, l := range lines {
		items[i] = orderLineOut(l)
	}
	return map[string]any{"items": items, "total": sess.orderStore.Total()}, nil
}

func (t *ToolExecutor) confirmOrder(ctx context.Context, sess *Session) (map[string]any, error) {
	if sess.orderStore == nil {
		return nil, errOrderingOnly
	}
	if sess.orderStore.IsEmpty() {
		return nil, fmt.Errorf("cannot confirm an empty order")
	}

	order, err := t.store.CreateOrder(ctx, store.CreateOrderParams{
		ID:             uuid.NewString(),
		BusinessID:     sess.business.ID,
		VoiceSessionID: pgText(sess.voiceSessionID),
		Total:          sess.orderStore.Total(),
	})
	if err != nil {
		return nil, err
	}

	for _, line := range sess.orderStore.Snapshot() {
		if _, err := t.store.CreateOrderItem(ctx, store.CreateOrderItemParams{
			ID: uuid.NewString(), OrderID: order.ID,
			ProductID: line.ProductID, Name: line.Name, Price: line.Price, Quantity: line.Quantity,
		}); err != nil {
			return nil, err
		}
	}

	t.events.Publish(ctx, events.Event{Name: "order.confirmed", Data: order})
	sess.orderStore.Clear()

	return map[string]any{"order_id": order.ID, "total": order.Total}, nil
}

func (t *ToolExecutor) setCustomerName(ctx context.Context, sess *Session, args map[string]any) (map[string]any, error) {
	name := stringArg(args, "name")
	if name == "" {
		return nil, fmt.Errorf("name is required")
	}

	order, err := t.store.GetMostRecentOrderForVoiceSession(ctx, pgText(sess.voiceSessionID))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, fmt.Errorf("no confirmed order to attach a customer name to yet")
		}
		return nil, err
	}

	updated, err := t.store.UpdateOrderCustomerName(ctx, store.UpdateOrderCustomerNameParams{
		ID: order.ID, CustomerName: pgText(name),
	})
	if err != nil {
		return nil, err
	}
	return map[string]any{"order_id": updated.ID, "customer_name": name}, nil
}

// promptPayment signals that checkout is ready — legacy opens the Pay
// your order screen once set_customer_name has already succeeded; this
// tool exists purely for the model to call in the same turn as the
// standalone name question, per the mandatory checkout-closing order.
func (t *ToolExecutor) promptPayment(ctx context.Context, sess *Session) (map[string]any, error) {
	if sess.orderStore == nil {
		return nil, errOrderingOnly
	}
	order, err := t.store.GetMostRecentOrderForVoiceSession(ctx, pgText(sess.voiceSessionID))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, fmt.Errorf("cannot proceed — the order has not been confirmed yet")
		}
		return nil, err
	}
	return map[string]any{"success": true, "prompt_payment": true, "order_id": order.ID, "total": order.Total}, nil
}

// --- Booking tools ---

func (t *ToolExecutor) listTreatments(ctx context.Context, sess *Session) (map[string]any, error) {
	if sess.mode != ModeBooking {
		return nil, errBookingOnly
	}
	products, err := t.store.ListActiveProductsForBusiness(ctx, sess.business.ID)
	if err != nil {
		return nil, err
	}
	type treatment struct {
		ID          string  `json:"id"`
		Name        string  `json:"name"`
		Price       float64 `json:"price"`
		DurationMin int32   `json:"duration_min"`
		Category    string  `json:"category"`
		Description string  `json:"description"`
	}
	treatments := make([]treatment, 0, len(products))
	for _, p := range products {
		duration := p.DurationMin
		if duration <= 0 {
			duration = 30
		}
		treatments = append(treatments, treatment{
			ID: p.ProductID, Name: p.Name,
			Price:       pricing.EffectivePrice(p.Price, p.DiscountPercent),
			DurationMin: duration, Category: p.Category, Description: p.Description,
		})
	}
	return map[string]any{"treatments": treatments}, nil
}

func (t *ToolExecutor) checkAvailability(ctx context.Context, sess *Session, args map[string]any) (map[string]any, error) {
	if sess.mode != ModeBooking {
		return nil, errBookingOnly
	}
	slots, err := scheduling.AvailableSlots(ctx, t.store, sess.business.ID, stringArg(args, "product_id"), stringArg(args, "date"))
	if err != nil {
		return map[string]any{"error": err.Error()}, nil
	}
	formatted := make([]string, len(slots))
	for i, s := range slots {
		formatted[i] = s.Format(time.RFC3339)
	}
	return map[string]any{"slots": formatted}, nil
}

func (t *ToolExecutor) bookAppointment(ctx context.Context, sess *Session, args map[string]any) (map[string]any, error) {
	if sess.mode != ModeBooking {
		return nil, errBookingOnly
	}
	productID := stringArg(args, "product_id")
	customerName := strings.TrimSpace(stringArg(args, "customer_name"))
	if productID == "" || customerName == "" || stringArg(args, "starts_at") == "" {
		return map[string]any{"error": "product_id, starts_at, and customer_name are required"}, nil
	}

	startsAt, err := time.Parse(time.RFC3339, stringArg(args, "starts_at"))
	if err != nil {
		return map[string]any{"error": scheduling.ErrInvalidStartTime.Error()}, nil
	}

	product, err := t.store.GetActiveProductBySlug(ctx, store.GetActiveProductBySlugParams{
		BusinessID: sess.business.ID, ProductID: productID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return map[string]any{"error": scheduling.ErrProductNotFound.Error()}, nil
		}
		return nil, err
	}

	date := startsAt.UTC().Format(scheduling.DateLayout)
	available, err := scheduling.AvailableSlots(ctx, t.store, sess.business.ID, productID, date)
	if err != nil {
		return map[string]any{"error": err.Error()}, nil
	}
	slotTaken := false
	for _, s := range available {
		if s.Equal(startsAt) {
			slotTaken = true
			break
		}
	}
	if !slotTaken {
		return map[string]any{"error": scheduling.ErrSlotUnavailable.Error()}, nil
	}

	duration := int(product.DurationMin)
	if duration <= 0 {
		duration = 30
	}
	endsAt := startsAt.Add(time.Duration(duration) * time.Minute)

	appointment, err := t.store.CreateAppointment(ctx, store.CreateAppointmentParams{
		ID:            uuid.NewString(),
		BusinessID:    sess.business.ID,
		ProductID:     product.ProductID,
		TreatmentName: product.Name,
		CustomerName:  customerName,
		CustomerPhone: strings.TrimSpace(stringArg(args, "customer_phone")),
		StartsAt:      pgTimestamptz(startsAt),
		EndsAt:        pgTimestamptz(endsAt),
	})
	if err != nil {
		return nil, err
	}

	t.events.Publish(ctx, events.Event{Name: "appointment.booked", Data: appointment})

	return map[string]any{"success": true, "appointment": toAppointmentSummary(appointment)}, nil
}

func (t *ToolExecutor) cancelAppointment(ctx context.Context, sess *Session, args map[string]any) (map[string]any, error) {
	if sess.mode != ModeBooking {
		return nil, errBookingOnly
	}
	id := stringArg(args, "appointment_id")
	if id == "" {
		return map[string]any{"error": "appointment_id is required"}, nil
	}
	appointment, err := t.store.CancelAppointment(ctx, store.CancelAppointmentParams{ID: id, BusinessID: sess.business.ID})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return map[string]any{"error": "appointment not found"}, nil
		}
		return nil, err
	}
	return map[string]any{"success": true, "appointment": toAppointmentSummary(appointment)}, nil
}

func toAppointmentSummary(a store.Appointment) map[string]any {
	return map[string]any{
		"id":             a.ID,
		"product_id":     a.ProductID,
		"treatment_name": a.TreatmentName,
		"customer_name":  a.CustomerName,
		"starts_at":      a.StartsAt.Time.Format(time.RFC3339),
		"ends_at":        a.EndsAt.Time.Format(time.RFC3339),
		"status":         a.Status,
	}
}
