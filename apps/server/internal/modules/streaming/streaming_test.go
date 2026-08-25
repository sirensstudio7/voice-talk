package streaming

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/platform/events"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

type fixture struct {
	server    *httptest.Server
	slug      string
	productID string
	pool      *pgxpool.Pool
}

// Integration test against Postgres — skipped unless DATABASE_URL is set,
// same convention as every other module's test.
func newTestFixture(t *testing.T) fixture {
	t.Helper()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set; skipping streaming integration test")
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("connect to database: %v", err)
	}

	queries := store.New(pool)
	businessID := uuid.NewString()
	slug := "streaming-test-" + businessID[:8]
	if _, err := queries.CreateBusiness(ctx, store.CreateBusinessParams{
		ID: businessID, Slug: slug, Name: "Streaming Test Cafe",
	}); err != nil {
		t.Fatalf("create fixture business: %v", err)
	}
	// Default business_type/primary_use_case ("", "both") yield ordering
	// mode via capabilities.Get — no update needed, unlike booking's test
	// fixture which had to force salon mode.

	product, err := queries.CreateProduct(ctx, store.CreateProductParams{
		ID: uuid.NewString(), BusinessID: businessID, ProductID: "latte",
		Name: "Latte", Price: 25000, Category: "coffee", IsActive: true, DurationMin: 30,
	})
	if err != nil {
		t.Fatalf("create fixture product: %v", err)
	}

	m := New(Deps{DB: pool, Events: events.NewBus(), AllowedOrigins: nil})
	r := chi.NewRouter()
	m.RegisterRoutes(r)
	server := httptest.NewServer(r)

	return fixture{server: server, slug: slug, productID: product.ProductID, pool: pool}
}

// newBookingTestFixture forces the fixture business into salon/appointments
// mode via raw SQL, same as booking_test.go — no owner endpoint sets
// business_type/primary_use_case yet.
func newBookingTestFixture(t *testing.T) fixture {
	t.Helper()
	f := newTestFixture(t)

	businessID, err := f.pool.Query(context.Background(), `SELECT id FROM businesses WHERE slug = $1`, f.slug)
	if err != nil {
		t.Fatalf("query fixture business id: %v", err)
	}
	var id string
	for businessID.Next() {
		if err := businessID.Scan(&id); err != nil {
			t.Fatalf("scan fixture business id: %v", err)
		}
	}
	businessID.Close()

	if _, err := f.pool.Exec(context.Background(),
		`UPDATE businesses SET business_type = 'salon', primary_use_case = 'appointments' WHERE id = $1`, id,
	); err != nil {
		t.Fatalf("force salon mode: %v", err)
	}
	return f
}

func (f fixture) close() {
	f.server.Close()
	f.pool.Close()
}

func (f fixture) dial(t *testing.T) *websocket.Conn {
	t.Helper()
	wsURL := "ws" + strings.TrimPrefix(f.server.URL, "http") + "/businesses/" + f.slug + "/voice-session"
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	conn, _, err := websocket.Dial(ctx, wsURL, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	return conn
}

func sendMsg(t *testing.T, conn *websocket.Conn, msgType string, data any) {
	t.Helper()
	payload, err := json.Marshal(clientEnvelope{Type: msgType, Data: mustMarshal(t, data)})
	if err != nil {
		t.Fatalf("marshal client message: %v", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := conn.Write(ctx, websocket.MessageText, payload); err != nil {
		t.Fatalf("write: %v", err)
	}
}

func mustMarshal(t *testing.T, v any) []byte {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	return b
}

// recvUntil reads server messages until one of the given types arrives,
// decoding its Data into dest. Fails the test if none arrives in time.
func recvUntil(t *testing.T, conn *websocket.Conn, dest any, wantTypes ...string) string {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	for {
		_, data, err := conn.Read(ctx)
		if err != nil {
			t.Fatalf("read (waiting for %v): %v", wantTypes, err)
		}
		var envelope struct {
			Type string          `json:"type"`
			Data json.RawMessage `json:"data"`
		}
		if err := json.Unmarshal(data, &envelope); err != nil {
			t.Fatalf("unmarshal server message: %v", err)
		}
		for _, want := range wantTypes {
			if envelope.Type == want {
				if dest != nil {
					if err := json.Unmarshal(envelope.Data, dest); err != nil {
						t.Fatalf("unmarshal %s payload: %v", envelope.Type, err)
					}
				}
				return envelope.Type
			}
		}
	}
}

func TestVoiceSession_OrderingFlow(t *testing.T) {
	f := newTestFixture(t)
	defer f.close()

	conn := f.dial(t)
	defer func() { _ = conn.Close(websocket.StatusNormalClosure, "") }()

	recvUntil(t, conn, nil, "session.status")

	sendMsg(t, conn, "order.add_item", addItemPayload{ProductID: f.productID, Quantity: 2})
	var updated orderUpdatedPayload
	recvUntil(t, conn, &updated, "order.updated")
	if len(updated.Items) != 1 || updated.Items[0].Quantity != 2 || updated.Total != 50000 {
		t.Fatalf("unexpected cart after add: %+v", updated)
	}

	sendMsg(t, conn, "order.decrement_item", productIDPayload{ProductID: f.productID})
	recvUntil(t, conn, &updated, "order.updated")
	if updated.Items[0].Quantity != 1 || updated.Total != 25000 {
		t.Fatalf("unexpected cart after decrement: %+v", updated)
	}

	sendMsg(t, conn, "debug.tool_call", debugToolCallPayload{Name: "confirm_order"})
	recvUntil(t, conn, nil, "tool_result")

	sendMsg(t, conn, "input.text", inputTextPayload{Text: "hello"})
	var transcript transcriptPayload
	recvUntil(t, conn, &transcript, "transcript.assistant")
	if transcript.Text == "" {
		t.Fatalf("expected a fake provider reply, got empty text")
	}

	sendMsg(t, conn, "session.end", map[string]any{})
	time.Sleep(200 * time.Millisecond) // let the server finish EndVoiceSession before we query

	rows, err := f.pool.Query(context.Background(), `SELECT status, total FROM orders WHERE business_id = (SELECT id FROM businesses WHERE slug = $1)`, f.slug)
	if err != nil {
		t.Fatalf("query orders: %v", err)
	}
	defer rows.Close()
	found := false
	for rows.Next() {
		var status string
		var total float64
		if err := rows.Scan(&status, &total); err != nil {
			t.Fatalf("scan order row: %v", err)
		}
		if status != "confirmed" || total != 25000 {
			t.Fatalf("unexpected persisted order: status=%s total=%v", status, total)
		}
		found = true
	}
	if !found {
		t.Fatalf("expected a confirmed order to be persisted")
	}

	var voiceSessionStatus string
	if err := f.pool.QueryRow(context.Background(),
		`SELECT status FROM voice_sessions WHERE business_id = (SELECT id FROM businesses WHERE slug = $1)`, f.slug,
	).Scan(&voiceSessionStatus); err != nil {
		t.Fatalf("query voice session: %v", err)
	}
	if voiceSessionStatus != "ended" {
		t.Fatalf("expected voice_sessions.status = ended, got %q", voiceSessionStatus)
	}
}

// TestVoiceSession_BookingFlow exercises the booking-mode tools that used
// to be Phase 1 stubs — check_availability/book_appointment now go
// through internal/scheduling for real, the same domain logic the
// booking module's own HTTP endpoints use.
func TestVoiceSession_BookingFlow(t *testing.T) {
	f := newBookingTestFixture(t)
	defer f.close()

	conn := f.dial(t)
	defer func() { _ = conn.Close(websocket.StatusNormalClosure, "") }()

	recvUntil(t, conn, nil, "session.status")

	sendMsg(t, conn, "debug.tool_call", debugToolCallPayload{Name: "list_treatments"})
	var treatments struct {
		Treatments []map[string]any `json:"treatments"`
	}
	recvUntil(t, conn, &treatments, "tool_result")
	if len(treatments.Treatments) != 1 {
		t.Fatalf("expected 1 treatment, got %+v", treatments.Treatments)
	}

	date := nextNonSunday()
	sendMsg(t, conn, "debug.tool_call", debugToolCallPayload{
		Name: "check_availability",
		Args: map[string]any{"product_id": f.productID, "date": date},
	})
	var availability struct {
		Slots []string `json:"slots"`
	}
	recvUntil(t, conn, &availability, "tool_result")
	if len(availability.Slots) == 0 {
		t.Fatalf("expected at least one open slot on %s", date)
	}

	sendMsg(t, conn, "debug.tool_call", debugToolCallPayload{
		Name: "book_appointment",
		Args: map[string]any{
			"product_id":    f.productID,
			"starts_at":     availability.Slots[0],
			"customer_name": "Jane Doe",
		},
	})
	var booked struct {
		Success     bool           `json:"success"`
		Appointment map[string]any `json:"appointment"`
	}
	recvUntil(t, conn, &booked, "tool_result")
	if !booked.Success {
		t.Fatalf("expected book_appointment to succeed, got %+v", booked)
	}

	sendMsg(t, conn, "session.end", map[string]any{})
	time.Sleep(200 * time.Millisecond)

	var count int
	if err := f.pool.QueryRow(context.Background(),
		`SELECT count(*) FROM appointments WHERE business_id = (SELECT id FROM businesses WHERE slug = $1) AND customer_name = 'Jane Doe'`, f.slug,
	).Scan(&count); err != nil {
		t.Fatalf("query appointments: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected 1 persisted appointment, got %d", count)
	}
}

// nextNonSunday returns a YYYY-MM-DD date at least a day out that isn't
// Sunday — the fixture business's default hours close all day Sunday.
func nextNonSunday() string {
	d := time.Now().UTC().AddDate(0, 0, 1)
	for d.Weekday() == time.Sunday {
		d = d.AddDate(0, 0, 1)
	}
	return d.Format("2006-01-02")
}

// newGeminiTestFixture is identical to newTestFixture except the module is
// built with a real GeminiProvider instead of FakeProvider — only used by
// TestVoiceSession_Gemini, which is itself skipped unless GEMINI_API_KEY is
// set, so this never runs in CI or any DB-gated-only environment.
func newGeminiTestFixture(t *testing.T) fixture {
	t.Helper()
	apiKey := os.Getenv("GEMINI_API_KEY")
	if apiKey == "" {
		t.Skip("GEMINI_API_KEY not set; skipping real Gemini Live smoke test")
	}
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set; skipping streaming integration test")
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("connect to database: %v", err)
	}

	queries := store.New(pool)
	businessID := uuid.NewString()
	slug := "streaming-gemini-test-" + businessID[:8]
	if _, err := queries.CreateBusiness(ctx, store.CreateBusinessParams{
		ID: businessID, Slug: slug, Name: "Gemini Smoke Test Cafe",
	}); err != nil {
		t.Fatalf("create fixture business: %v", err)
	}
	product, err := queries.CreateProduct(ctx, store.CreateProductParams{
		ID: uuid.NewString(), BusinessID: businessID, ProductID: "latte",
		Name: "Latte", Price: 25000, Category: "coffee", IsActive: true, DurationMin: 30,
	})
	if err != nil {
		t.Fatalf("create fixture product: %v", err)
	}

	model := os.Getenv("GEMINI_MODEL")
	if model == "" {
		model = "gemini-3.1-flash-live-preview"
	}
	m := New(Deps{DB: pool, Events: events.NewBus(), AllowedOrigins: nil, GeminiAPIKey: apiKey, GeminiModel: model})
	r := chi.NewRouter()
	m.RegisterRoutes(r)
	server := httptest.NewServer(r)

	return fixture{server: server, slug: slug, productID: product.ProductID, pool: pool}
}

// TestVoiceSession_Gemini is an opt-in smoke test against a real Gemini Live
// connection — skipped unless GEMINI_API_KEY is set (never runs alongside
// the plain DATABASE_URL-gated suite). It only exercises the text path
// (input.text), since driving real audio needs a PCM sample and a mic-shaped
// client; that's covered instead by the manual live-boot WS client steps in
// the streaming Phase 2 plan's verification section.
func TestVoiceSession_Gemini(t *testing.T) {
	f := newGeminiTestFixture(t)
	defer f.close()

	conn := f.dial(t)
	defer func() { _ = conn.Close(websocket.StatusNormalClosure, "") }()

	recvUntil(t, conn, nil, "session.status")

	sendMsg(t, conn, "input.text", inputTextPayload{Text: "Hi, what do you have on the menu?"})

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	for {
		_, data, err := conn.Read(ctx)
		if err != nil {
			t.Fatalf("read (waiting for transcript.assistant or audio): %v", err)
		}
		if len(data) == 0 {
			continue // shouldn't happen, but guard against a stray empty frame
		}
		var envelope struct {
			Type string `json:"type"`
		}
		if json.Unmarshal(data, &envelope) == nil && envelope.Type == "transcript.assistant" {
			break
		}
	}

	sendMsg(t, conn, "session.end", map[string]any{})
}

func TestVoiceSession_UnknownBusiness(t *testing.T) {
	f := newTestFixture(t)
	defer f.close()

	wsURL := "ws" + strings.TrimPrefix(f.server.URL, "http") + "/businesses/does-not-exist/voice-session"
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, resp, err := websocket.Dial(ctx, wsURL, nil)
	if err == nil {
		t.Fatalf("expected dial to fail for unknown business")
	}
	if resp != nil && resp.StatusCode != 404 {
		t.Fatalf("expected 404, got %d", resp.StatusCode)
	}
}
