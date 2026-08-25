package booking

import (
	"encoding/json"
	"net/http"

	"github.com/google/uuid"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/httpx"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/scheduling"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

func (m *Module) getSchedule(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())

	hours, err := scheduling.EnsureBusinessHours(r.Context(), m.store, access.BusinessID)
	if err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", access.BusinessID).Msg("get schedule")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load schedule")
		return
	}

	out := make([]businessHourOut, 0, len(hours))
	for _, h := range hours {
		out = append(out, toBusinessHourOut(h))
	}
	httpx.List(w, http.StatusOK, out)
}

// putSchedule replaces the business's entire week in one call — mirrors
// apps-legacy/server/src/services/appointments.ts's saveBusinessHours
// (delete-then-reinsert; there's no per-day PATCH in the legacy app
// either, since the admin UI always edits and saves the whole week).
func (m *Module) putSchedule(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())

	var req putScheduleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "invalid request body")
		return
	}
	for _, h := range req.Hours {
		if h.DayOfWeek < 0 || h.DayOfWeek > 6 {
			httpx.Error(w, http.StatusBadRequest, "invalid_request", "day_of_week must be 0-6")
			return
		}
	}

	if err := m.store.DeleteBusinessHours(r.Context(), access.BusinessID); err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", access.BusinessID).Msg("delete business hours")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to save schedule")
		return
	}

	for _, h := range req.Hours {
		if _, err := m.store.CreateBusinessHour(r.Context(), store.CreateBusinessHourParams{
			ID: uuid.NewString(), BusinessID: access.BusinessID,
			DayOfWeek: h.DayOfWeek, OpenTime: h.OpenTime, CloseTime: h.CloseTime, IsClosed: h.IsClosed,
		}); err != nil {
			m.deps.Log.Error().Err(err).Str("business_id", access.BusinessID).Msg("create business hour")
			httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to save schedule")
			return
		}
	}

	hours, err := scheduling.EnsureBusinessHours(r.Context(), m.store, access.BusinessID)
	if err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", access.BusinessID).Msg("reload schedule")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to save schedule")
		return
	}
	out := make([]businessHourOut, 0, len(hours))
	for _, h := range hours {
		out = append(out, toBusinessHourOut(h))
	}
	httpx.List(w, http.StatusOK, out)
}
