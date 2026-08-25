package booking

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/capabilities"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/httpx"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/scheduling"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

// resolvePublicBusiness looks up a business by slug for the public
// (unauthenticated) endpoints, which have no authz.RequireBusinessMember
// middleware to do it for them. Returns false and writes a 404 itself if
// not found.
func (m *Module) resolvePublicBusiness(w http.ResponseWriter, r *http.Request) (store.Business, bool) {
	slug := chi.URLParam(r, "slug")
	business, err := m.store.GetBusinessBySlug(r.Context(), slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "business_not_found", "business not found")
			return store.Business{}, false
		}
		m.deps.Log.Error().Err(err).Str("slug", slug).Msg("get business by slug")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load business")
		return store.Business{}, false
	}
	return business, true
}

func (m *Module) getAvailability(w http.ResponseWriter, r *http.Request) {
	business, ok := m.resolvePublicBusiness(w, r)
	if !ok {
		return
	}

	productID := r.URL.Query().Get("product_id")
	date := r.URL.Query().Get("date")
	if productID == "" || date == "" {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "product_id and date are required")
		return
	}

	slots, err := scheduling.AvailableSlots(r.Context(), m.store, business.ID, productID, date)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, slotErrorCode(err), err.Error())
		return
	}

	formatted := make([]string, len(slots))
	for i, s := range slots {
		formatted[i] = s.Format(time.RFC3339)
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"slots": formatted})
}

func (m *Module) createAppointment(w http.ResponseWriter, r *http.Request) {
	business, ok := m.resolvePublicBusiness(w, r)
	if !ok {
		return
	}

	caps := capabilities.Get(business.PrimaryUseCase, business.BusinessType)
	if !caps.BookingEnabled {
		httpx.Error(w, http.StatusForbidden, "booking_disabled", "booking is not enabled for this business")
		return
	}

	var req createAppointmentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "invalid request body")
		return
	}

	customerName := strings.TrimSpace(req.CustomerName)
	if req.ProductID == "" || customerName == "" || req.StartsAt == "" {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "product_id, customer_name, and starts_at are required")
		return
	}

	startsAt, err := time.Parse(time.RFC3339, req.StartsAt)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_start_time", scheduling.ErrInvalidStartTime.Error())
		return
	}

	product, err := m.store.GetActiveProductBySlug(r.Context(), store.GetActiveProductBySlugParams{
		BusinessID: business.ID, ProductID: req.ProductID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusBadRequest, "product_not_found", scheduling.ErrProductNotFound.Error())
			return
		}
		m.deps.Log.Error().Err(err).Str("business_id", business.ID).Msg("get product for appointment")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to create appointment")
		return
	}

	date := startsAt.UTC().Format(scheduling.DateLayout)
	available, err := scheduling.AvailableSlots(r.Context(), m.store, business.ID, req.ProductID, date)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, slotErrorCode(err), err.Error())
		return
	}
	slotTaken := false
	for _, s := range available {
		if s.Equal(startsAt) {
			slotTaken = true
			break
		}
	}
	if !slotTaken {
		httpx.Error(w, http.StatusConflict, "slot_unavailable", scheduling.ErrSlotUnavailable.Error())
		return
	}

	duration := int(product.DurationMin)
	if duration <= 0 {
		duration = 30
	}
	endsAt := startsAt.Add(time.Duration(duration) * time.Minute)

	appointment, err := m.store.CreateAppointment(r.Context(), store.CreateAppointmentParams{
		ID:            uuid.NewString(),
		BusinessID:    business.ID,
		ProductID:     product.ProductID,
		TreatmentName: product.Name,
		CustomerName:  customerName,
		CustomerPhone: strings.TrimSpace(req.CustomerPhone),
		StartsAt:      pgTimestamptz(startsAt),
		EndsAt:        pgTimestamptz(endsAt),
	})
	if err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", business.ID).Msg("create appointment")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to create appointment")
		return
	}

	httpx.JSON(w, http.StatusCreated, toAppointmentOut(appointment))
}

func (m *Module) listAppointments(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())

	params := store.ListAppointmentsParams{BusinessID: access.BusinessID}
	if date := r.URL.Query().Get("date"); date != "" {
		start, err := time.Parse(scheduling.DateLayout, date)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "invalid_request", "invalid date, use YYYY-MM-DD")
			return
		}
		params.StartsAfter = pgTimestamptz(start)
		params.StartsBefore = pgTimestamptz(start.AddDate(0, 0, 1))
	}

	appointments, err := m.store.ListAppointments(r.Context(), params)
	if err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", access.BusinessID).Msg("list appointments")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load appointments")
		return
	}

	out := make([]appointmentOut, 0, len(appointments))
	for _, a := range appointments {
		out = append(out, toAppointmentOut(a))
	}
	httpx.List(w, http.StatusOK, out)
}

func (m *Module) cancelAppointment(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())
	id := chi.URLParam(r, "id")

	appointment, err := m.store.CancelAppointment(r.Context(), store.CancelAppointmentParams{
		ID: id, BusinessID: access.BusinessID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "appointment_not_found", "appointment not found")
			return
		}
		m.deps.Log.Error().Err(err).Str("appointment_id", id).Msg("cancel appointment")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to cancel appointment")
		return
	}

	httpx.JSON(w, http.StatusOK, toAppointmentOut(appointment))
}

func slotErrorCode(err error) string {
	switch {
	case errors.Is(err, scheduling.ErrProductNotFound):
		return "product_not_found"
	case errors.Is(err, scheduling.ErrInvalidDate):
		return "invalid_date"
	default:
		return "invalid_request"
	}
}
