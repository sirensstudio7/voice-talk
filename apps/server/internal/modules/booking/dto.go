package booking

import (
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

func pgTimestamptz(t time.Time) pgtype.Timestamptz {
	return pgtype.Timestamptz{Time: t, Valid: true}
}

type businessHourInput struct {
	DayOfWeek int32  `json:"day_of_week"`
	OpenTime  string `json:"open_time"`
	CloseTime string `json:"close_time"`
	IsClosed  bool   `json:"is_closed"`
}

type businessHourOut struct {
	DayOfWeek int32  `json:"day_of_week"`
	OpenTime  string `json:"open_time"`
	CloseTime string `json:"close_time"`
	IsClosed  bool   `json:"is_closed"`
}

func toBusinessHourOut(h store.BusinessHour) businessHourOut {
	return businessHourOut{
		DayOfWeek: h.DayOfWeek,
		OpenTime:  h.OpenTime,
		CloseTime: h.CloseTime,
		IsClosed:  h.IsClosed,
	}
}

type putScheduleRequest struct {
	Hours []businessHourInput `json:"hours"`
}

type appointmentOut struct {
	ID            string `json:"id"`
	ProductID     string `json:"product_id"`
	TreatmentName string `json:"treatment_name"`
	CustomerName  string `json:"customer_name"`
	CustomerPhone string `json:"customer_phone"`
	StartsAt      string `json:"starts_at"`
	EndsAt        string `json:"ends_at"`
	Status        string `json:"status"`
	CreatedAt     string `json:"created_at"`
}

func toAppointmentOut(a store.Appointment) appointmentOut {
	return appointmentOut{
		ID:            a.ID,
		ProductID:     a.ProductID,
		TreatmentName: a.TreatmentName,
		CustomerName:  a.CustomerName,
		CustomerPhone: a.CustomerPhone,
		StartsAt:      a.StartsAt.Time.Format(time.RFC3339),
		EndsAt:        a.EndsAt.Time.Format(time.RFC3339),
		Status:        a.Status,
		CreatedAt:     a.CreatedAt.Time.Format(time.RFC3339),
	}
}

type createAppointmentRequest struct {
	ProductID     string `json:"product_id"`
	CustomerName  string `json:"customer_name"`
	CustomerPhone string `json:"customer_phone"`
	StartsAt      string `json:"starts_at"`
}
