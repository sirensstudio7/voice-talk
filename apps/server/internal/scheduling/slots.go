// Package scheduling holds the appointment-slot math shared between the
// booking module (owner-facing schedule/appointments) and the streaming
// module's booking-mode voice tools (check_availability/book_appointment)
// — the same "extract once a second consumer needs it" pattern
// internal/capabilities already established. Moved out of
// internal/modules/booking/slots.go verbatim; behavior is unchanged.
package scheduling

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

// SlotStepMinutes mirrors apps-legacy/server/src/services/appointments.ts's
// SLOT_STEP_MIN: candidate slots are offered every 15 minutes within a
// day's open hours, regardless of a treatment's own duration.
const SlotStepMinutes = 15

// Business hours and appointment times are anchored to UTC "wall clock"
// values with no per-business timezone yet — this is a direct port of
// the legacy app's own simplification (new Date(`${date}T${time}:00.000Z`)),
// not a new limitation introduced here.
const DateLayout = "2006-01-02"

var (
	ErrProductNotFound  = errors.New("product not found or not bookable")
	ErrInvalidDate      = errors.New("invalid date, use YYYY-MM-DD")
	ErrInvalidStartTime = errors.New("invalid start time")
	ErrSlotUnavailable  = errors.New("that time slot is no longer available")
)

func pgTimestamptz(t time.Time) pgtype.Timestamptz {
	return pgtype.Timestamptz{Time: t, Valid: true}
}

type defaultHour struct {
	DayOfWeek int32
	OpenTime  string
	CloseTime string
	IsClosed  bool
}

func defaultBusinessHours() []defaultHour {
	hours := make([]defaultHour, 7)
	for day := int32(0); day < 7; day++ {
		hours[day] = defaultHour{
			DayOfWeek: day,
			OpenTime:  "09:00",
			CloseTime: "18:00",
			IsClosed:  day == 0, // Sunday
		}
	}
	return hours
}

// EnsureBusinessHours returns the business's hours, seeding
// defaultBusinessHours on first access — mirrors
// ensureDefaultBusinessHours/listBusinessHours in the legacy service.
func EnsureBusinessHours(ctx context.Context, q *store.Queries, businessID string) ([]store.BusinessHour, error) {
	existing, err := q.ListBusinessHours(ctx, businessID)
	if err != nil {
		return nil, err
	}
	if len(existing) > 0 {
		return existing, nil
	}

	for _, h := range defaultBusinessHours() {
		if _, err := q.CreateBusinessHour(ctx, store.CreateBusinessHourParams{
			ID: uuid.NewString(), BusinessID: businessID,
			DayOfWeek: h.DayOfWeek, OpenTime: h.OpenTime, CloseTime: h.CloseTime, IsClosed: h.IsClosed,
		}); err != nil {
			return nil, err
		}
	}
	return q.ListBusinessHours(ctx, businessID)
}

func parseTimeToMinutes(value string) (int, error) {
	var h, min int
	if _, err := fmt.Sscanf(value, "%d:%d", &h, &min); err != nil {
		return 0, fmt.Errorf("invalid time %q", value)
	}
	return h*60 + min, nil
}

func minutesToTime(total int) string {
	return fmt.Sprintf("%02d:%02d", total/60, total%60)
}

func dayStart(date, timeStr string) (time.Time, error) {
	return time.Parse(time.RFC3339, date+"T"+timeStr+":00Z")
}

func dayOfWeekFor(date string) (int32, error) {
	t, err := time.Parse(DateLayout, date)
	if err != nil {
		return 0, err
	}
	return int32(t.UTC().Weekday()), nil
}

// AvailableSlots ports getAvailableSlots: it validates the product
// exists and is active, finds that date's business hours, and returns
// every non-overlapping SlotStepMinutes-aligned start time that fits
// the product's duration before closing.
func AvailableSlots(ctx context.Context, q *store.Queries, businessID, productSlug, date string) ([]time.Time, error) {
	product, err := q.GetActiveProductBySlug(ctx, store.GetActiveProductBySlugParams{
		BusinessID: businessID, ProductID: productSlug,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrProductNotFound
		}
		return nil, err
	}

	if _, err := time.Parse(DateLayout, date); err != nil {
		return nil, ErrInvalidDate
	}

	hours, err := EnsureBusinessHours(ctx, q, businessID)
	if err != nil {
		return nil, err
	}
	dayOfWeek, err := dayOfWeekFor(date)
	if err != nil {
		return nil, ErrInvalidDate
	}

	var dayHours *store.BusinessHour
	for i := range hours {
		if hours[i].DayOfWeek == dayOfWeek {
			dayHours = &hours[i]
			break
		}
	}
	if dayHours == nil || dayHours.IsClosed {
		return []time.Time{}, nil
	}

	openMinutes, err := parseTimeToMinutes(dayHours.OpenTime)
	if err != nil {
		return nil, err
	}
	closeMinutes, err := parseTimeToMinutes(dayHours.CloseTime)
	if err != nil {
		return nil, err
	}

	duration := int(product.DurationMin)
	if duration <= 0 {
		duration = 30
	}

	rangeStart, err := dayStart(date, dayHours.OpenTime)
	if err != nil {
		return nil, err
	}
	rangeEnd, err := dayStart(date, dayHours.CloseTime)
	if err != nil {
		return nil, err
	}

	booked, err := q.ListActiveAppointmentsInRange(ctx, store.ListActiveAppointmentsInRangeParams{
		BusinessID: businessID,
		StartsAt:   pgTimestamptz(rangeStart),
		StartsAt_2: pgTimestamptz(rangeEnd),
	})
	// StartsAt_2 is sqlc's name for the query's second $starts_at-shaped
	// positional param (the exclusive range end) — see appointments.sql.
	if err != nil {
		return nil, err
	}

	slots := []time.Time{}
	for minute := openMinutes; minute+duration <= closeMinutes; minute += SlotStepMinutes {
		slotStart, err := dayStart(date, minutesToTime(minute))
		if err != nil {
			return nil, err
		}
		slotEnd := slotStart.Add(time.Duration(duration) * time.Minute)

		overlaps := false
		for _, appt := range booked {
			apptStart := appt.StartsAt.Time
			apptEnd := appt.EndsAt.Time
			if slotStart.Before(apptEnd) && slotEnd.After(apptStart) {
				overlaps = true
				break
			}
		}
		if !overlaps {
			slots = append(slots, slotStart)
		}
	}
	return slots, nil
}
