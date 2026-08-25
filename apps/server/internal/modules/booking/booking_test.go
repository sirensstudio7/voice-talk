package booking

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
	"github.com/sirensstudio7/voice-talk/apps/server/internal/scheduling"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

const testJWTSecret = "test-secret"

type fixture struct {
	handler   http.Handler
	slug      string
	productID string
	token     string
	pool      *pgxpool.Pool
}

// Integration test against Postgres — skipped unless DATABASE_URL is set,
// same convention as the other modules' tests. The fixture business is
// forced into salon/appointments mode via a raw UPDATE (no owner-facing
// endpoint sets business_type/primary_use_case yet — that's the
// appearance/settings module's job) so capabilities.Get reports
// booking_enabled: true, matching what a real salon business would have.
func newTestFixture(t *testing.T) fixture {
	t.Helper()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set; skipping booking integration test")
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("connect to database: %v", err)
	}

	queries := store.New(pool)
	userID := uuid.NewString()
	if _, err := queries.CreateUser(ctx, store.CreateUserParams{
		ID: userID, Email: "booking-" + userID[:8] + "@example.com",
		PasswordHash: "unused", Name: "Booking Test Owner",
	}); err != nil {
		t.Fatalf("create fixture user: %v", err)
	}

	businessID := uuid.NewString()
	slug := "booking-test-" + businessID[:8]
	if _, err := queries.CreateBusiness(ctx, store.CreateBusinessParams{
		ID: businessID, Slug: slug, Name: "Booking Test Salon",
	}); err != nil {
		t.Fatalf("create fixture business: %v", err)
	}
	if _, err := pool.Exec(ctx, `UPDATE businesses SET business_type = 'salon', primary_use_case = 'appointments' WHERE id = $1`, businessID); err != nil {
		t.Fatalf("set fixture business to salon mode: %v", err)
	}
	if _, err := queries.CreateBusinessMember(ctx, store.CreateBusinessMemberParams{
		ID: uuid.NewString(), UserID: userID, BusinessID: businessID, Role: "owner",
	}); err != nil {
		t.Fatalf("create fixture membership: %v", err)
	}

	product, err := queries.CreateProduct(ctx, store.CreateProductParams{
		ID: uuid.NewString(), BusinessID: businessID, ProductID: "haircut",
		Name: "Haircut", Price: 50000, Category: "hair", IsActive: true, DurationMin: 30,
	})
	if err != nil {
		t.Fatalf("create fixture product: %v", err)
	}

	accessToken, err := authtoken.Issue(testJWTSecret, userID, time.Hour)
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}

	m := New(Deps{DB: pool, JWTSecret: testJWTSecret})
	r := chi.NewRouter()
	m.RegisterRoutes(r)

	return fixture{handler: r, slug: slug, productID: product.ProductID, token: accessToken, pool: pool}
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

// nextMonday returns a YYYY-MM-DD date that's guaranteed open per
// defaultBusinessHours (Sunday is closed by default).
func nextMonday() string {
	t := time.Now().UTC()
	for t.Weekday() != time.Monday {
		t = t.AddDate(0, 0, 1)
	}
	return t.Format(scheduling.DateLayout)
}

func TestSchedule_DefaultsThenReplace(t *testing.T) {
	f := newTestFixture(t)
	defer f.pool.Close()

	base := "/businesses/" + f.slug + "/schedule"

	// First GET seeds the default week (7 days, Sunday closed).
	rec := doJSON(t, f.handler, http.MethodGet, base, f.token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("get schedule: got status %d, body %s", rec.Code, rec.Body.String())
	}
	var listEnvelope struct {
		Items []businessHourOut `json:"items"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &listEnvelope); err != nil {
		t.Fatalf("decode schedule: %v", err)
	}
	if len(listEnvelope.Items) != 7 {
		t.Fatalf("expected 7 default days, got %d", len(listEnvelope.Items))
	}

	// Replace with a custom week: only Monday open, 10:00-14:00.
	rec = doJSON(t, f.handler, http.MethodPut, base, f.token, putScheduleRequest{
		Hours: []businessHourInput{
			{DayOfWeek: 1, OpenTime: "10:00", CloseTime: "14:00", IsClosed: false},
		},
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("put schedule: got status %d, body %s", rec.Code, rec.Body.String())
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &listEnvelope); err != nil {
		t.Fatalf("decode replaced schedule: %v", err)
	}
	if len(listEnvelope.Items) != 1 || listEnvelope.Items[0].OpenTime != "10:00" {
		t.Fatalf("expected replaced single-day schedule, got %+v", listEnvelope.Items)
	}
}

func TestAvailabilityAndBooking(t *testing.T) {
	f := newTestFixture(t)
	defer f.pool.Close()

	// Open Monday 09:00-11:00 only, so slots are predictable.
	rec := doJSON(t, f.handler, http.MethodPut, "/businesses/"+f.slug+"/schedule", f.token, putScheduleRequest{
		Hours: []businessHourInput{
			{DayOfWeek: 1, OpenTime: "09:00", CloseTime: "11:00", IsClosed: false},
		},
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("put schedule: got status %d, body %s", rec.Code, rec.Body.String())
	}

	date := nextMonday()
	availPath := "/businesses/" + f.slug + "/availability?product_id=" + f.productID + "&date=" + date

	rec = doJSON(t, f.handler, http.MethodGet, availPath, "", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("availability: got status %d, body %s", rec.Code, rec.Body.String())
	}
	var slotsResp struct {
		Slots []string `json:"slots"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &slotsResp); err != nil {
		t.Fatalf("decode availability: %v", err)
	}
	if len(slotsResp.Slots) == 0 {
		t.Fatalf("expected at least one open slot, got none")
	}
	firstSlot := slotsResp.Slots[0]

	// Book the first available slot.
	rec = doJSON(t, f.handler, http.MethodPost, "/businesses/"+f.slug+"/appointments", "", createAppointmentRequest{
		ProductID: f.productID, CustomerName: "Jane Doe", StartsAt: firstSlot,
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("create appointment: got status %d, body %s", rec.Code, rec.Body.String())
	}
	var appt appointmentOut
	if err := json.Unmarshal(rec.Body.Bytes(), &appt); err != nil {
		t.Fatalf("decode appointment: %v", err)
	}
	if appt.Status != "scheduled" || appt.TreatmentName != "Haircut" {
		t.Fatalf("unexpected appointment: %+v", appt)
	}

	// Booking the same slot again conflicts.
	rec = doJSON(t, f.handler, http.MethodPost, "/businesses/"+f.slug+"/appointments", "", createAppointmentRequest{
		ProductID: f.productID, CustomerName: "John Doe", StartsAt: firstSlot,
	})
	if rec.Code != http.StatusConflict {
		t.Fatalf("double-book: got status %d, want 409, body %s", rec.Code, rec.Body.String())
	}

	// Owner can see it in the list.
	rec = doJSON(t, f.handler, http.MethodGet, "/businesses/"+f.slug+"/appointments", f.token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("list appointments: got status %d, body %s", rec.Code, rec.Body.String())
	}
	var apptList struct {
		Items []appointmentOut `json:"items"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &apptList); err != nil {
		t.Fatalf("decode appointment list: %v", err)
	}
	if len(apptList.Items) != 1 {
		t.Fatalf("expected 1 appointment, got %d", len(apptList.Items))
	}

	// Cancel it.
	rec = doJSON(t, f.handler, http.MethodPatch, "/businesses/"+f.slug+"/appointments/"+appt.ID+"/cancel", f.token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("cancel: got status %d, body %s", rec.Code, rec.Body.String())
	}
	var cancelled appointmentOut
	if err := json.Unmarshal(rec.Body.Bytes(), &cancelled); err != nil {
		t.Fatalf("decode cancelled appointment: %v", err)
	}
	if cancelled.Status != "cancelled" {
		t.Fatalf("expected status cancelled, got %q", cancelled.Status)
	}

	// The slot is available again after cancellation.
	rec = doJSON(t, f.handler, http.MethodGet, availPath, "", nil)
	if err := json.Unmarshal(rec.Body.Bytes(), &slotsResp); err != nil {
		t.Fatalf("decode availability after cancel: %v", err)
	}
	found := false
	for _, s := range slotsResp.Slots {
		if s == firstSlot {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected %q to be available again after cancellation, got %v", firstSlot, slotsResp.Slots)
	}
}

func TestCreateAppointment_UnknownProductRejected(t *testing.T) {
	f := newTestFixture(t)
	defer f.pool.Close()

	rec := doJSON(t, f.handler, http.MethodPost, "/businesses/"+f.slug+"/appointments", "", createAppointmentRequest{
		ProductID: "does-not-exist", CustomerName: "Jane Doe", StartsAt: time.Now().UTC().Format(time.RFC3339),
	})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("unknown product: got status %d, want 400, body %s", rec.Code, rec.Body.String())
	}
}
