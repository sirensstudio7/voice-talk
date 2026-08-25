package photomoment

import (
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

func nullableTime(t pgtype.Timestamptz) *string {
	if !t.Valid {
		return nil
	}
	s := t.Time.Format(time.RFC3339)
	return &s
}

func nullableStr(t pgtype.Text) *string {
	if !t.Valid {
		return nil
	}
	s := t.String
	return &s
}

func textArg(s *string) pgtype.Text {
	if s == nil {
		return pgtype.Text{}
	}
	return pgtype.Text{String: *s, Valid: true}
}

func int4Arg(i *int32) pgtype.Int4 {
	if i == nil {
		return pgtype.Int4{}
	}
	return pgtype.Int4{Int32: *i, Valid: true}
}

func boolArg(b *bool) pgtype.Bool {
	if b == nil {
		return pgtype.Bool{}
	}
	return pgtype.Bool{Bool: *b, Valid: true}
}

func pgTextValid(s string) pgtype.Text {
	return pgtype.Text{String: s, Valid: true}
}

func pgtypeTimestamptz(t time.Time) pgtype.Timestamptz {
	return pgtype.Timestamptz{Time: t, Valid: true}
}

type settingsOut struct {
	BusinessID       string  `json:"business_id"`
	Enabled          bool    `json:"enabled"`
	VoicePrompt      string  `json:"voice_prompt"`
	CountdownSeconds int32   `json:"countdown_seconds"`
	QrExpiryHours    int32   `json:"qr_expiry_hours"`
	LogoURL          *string `json:"logo_url"`
	FrameURL         *string `json:"frame_url"`
	CampaignText     *string `json:"campaign_text"`
	AutoDeleteDays   int32   `json:"auto_delete_days"`
	UpdatedAt        string  `json:"updated_at"`
}

func toSettingsOut(s store.PhotoSetting) settingsOut {
	return settingsOut{
		BusinessID:       s.BusinessID,
		Enabled:          s.Enabled,
		VoicePrompt:      s.VoicePrompt,
		CountdownSeconds: s.CountdownSeconds,
		QrExpiryHours:    s.QrExpiryHours,
		LogoURL:          nullableStr(s.LogoUrl),
		FrameURL:         nullableStr(s.FrameUrl),
		CampaignText:     nullableStr(s.CampaignText),
		AutoDeleteDays:   s.AutoDeleteDays,
		UpdatedAt:        s.UpdatedAt.Time.Format(time.RFC3339),
	}
}

type publicConfigOut struct {
	Enabled          bool   `json:"enabled"`
	VoicePrompt      string `json:"voice_prompt"`
	CountdownSeconds int32  `json:"countdown_seconds"`
}

type updateSettingsRequest struct {
	Enabled          *bool   `json:"enabled"`
	VoicePrompt      *string `json:"voice_prompt"`
	CountdownSeconds *int32  `json:"countdown_seconds"`
	QrExpiryHours    *int32  `json:"qr_expiry_hours"`
	CampaignText     *string `json:"campaign_text"`
	AutoDeleteDays   *int32  `json:"auto_delete_days"`
}

type sessionOut struct {
	ID                string  `json:"id"`
	BusinessID        string  `json:"business_id"`
	OrderID           *string `json:"order_id"`
	VisitorResponse   *string `json:"visitor_response"`
	Status            string  `json:"status"`
	QrToken           *string `json:"qr_token"`
	DownloadExpiresAt *string `json:"download_expires_at"`
	CreatedAt         string  `json:"created_at"`
}

func toSessionOut(s store.PhotoSession) sessionOut {
	return sessionOut{
		ID:                s.ID,
		BusinessID:        s.BusinessID,
		OrderID:           nullableStr(s.OrderID),
		VisitorResponse:   nullableStr(s.VisitorResponse),
		Status:            s.Status,
		QrToken:           nullableStr(s.QrToken),
		DownloadExpiresAt: nullableTime(s.DownloadExpiresAt),
		CreatedAt:         s.CreatedAt.Time.Format(time.RFC3339),
	}
}

type startSessionRequest struct {
	OrderID *string `json:"order_id"`
}

type sessionResponseRequest struct {
	Response string `json:"response"` // "accepted" | "declined"
}

type galleryItemOut struct {
	ID           string  `json:"id"`
	Status       string  `json:"status"`
	PhotoURL     *string `json:"photo_url"`
	ThumbnailURL *string `json:"thumbnail_url"`
	CreatedAt    string  `json:"created_at"`
}

type downloadOut struct {
	PhotoURL  string `json:"photo_url"`
	ExpiresAt string `json:"expires_at"`
}

type analyticsOut struct {
	SessionsStarted  int64 `json:"sessions_started"`
	PhotosAccepted   int64 `json:"photos_accepted"`
	PhotosDeclined   int64 `json:"photos_declined"`
	PhotosDownloaded int64 `json:"photos_downloaded"`
}
