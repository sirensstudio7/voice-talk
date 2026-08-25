package platformadmin

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

func pgTextArg(s string) pgtype.Text {
	if s == "" {
		return pgtype.Text{}
	}
	return pgtype.Text{String: s, Valid: true}
}

type adminOut struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Email       string `json:"email"`
	Role        string `json:"role"`
	TotpEnabled bool   `json:"totp_enabled"`
}

func toAdminOut(a store.PlatformAdmin) adminOut {
	return adminOut{ID: a.ID, Name: a.Name, Email: a.Email, Role: a.Role, TotpEnabled: a.TotpEnabled}
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type loginResponse struct {
	Status       string `json:"status"` // "totp_setup_required" | "totp_required"
	PendingToken string `json:"pending_token"`
}

type setup2FAResponse struct {
	Secret     string `json:"secret"`
	OtpauthURL string `json:"otpauth_url"`
	QRCodePNG  string `json:"qr_code_png_base64"`
}

type verify2FARequest struct {
	Code string `json:"code"`
}

type verify2FAResponse struct {
	AccessToken string `json:"access_token"`
}

type userOut struct {
	ID          string  `json:"id"`
	Email       string  `json:"email"`
	Name        string  `json:"name"`
	Status      string  `json:"status"`
	Phone       string  `json:"phone"`
	LastLoginAt *string `json:"last_login_at"`
	CreatedAt   string  `json:"created_at"`
}

func toUserOut(u store.User) userOut {
	return userOut{
		ID: u.ID, Email: u.Email, Name: u.Name, Status: u.Status, Phone: u.Phone,
		LastLoginAt: nullableTime(u.LastLoginAt),
		CreatedAt:   u.CreatedAt.Time.Format(time.RFC3339),
	}
}

type membershipOut struct {
	BusinessID string `json:"business_id"`
	Slug       string `json:"slug"`
	Name       string `json:"name"`
	Role       string `json:"role"`
}

type userDetailOut struct {
	userOut
	Memberships []membershipOut `json:"memberships"`
}

type updateStatusRequest struct {
	Status string `json:"status"`
}

type resetPasswordResponse struct {
	TemporaryPassword string `json:"temporary_password"`
}

type businessOut struct {
	ID        string `json:"id"`
	Slug      string `json:"slug"`
	Name      string `json:"name"`
	IsActive  bool   `json:"is_active"`
	CreatedAt string `json:"created_at"`
}

func toBusinessOut(b store.Business) businessOut {
	return businessOut{ID: b.ID, Slug: b.Slug, Name: b.Name, IsActive: b.IsActive, CreatedAt: b.CreatedAt.Time.Format(time.RFC3339)}
}

type businessMemberOut struct {
	UserID string `json:"user_id"`
	Email  string `json:"email"`
	Name   string `json:"name"`
	Role   string `json:"role"`
}

type businessDetailOut struct {
	businessOut
	MemberCount       int64               `json:"member_count"`
	ProductCount      int64               `json:"product_count"`
	PresentationCount int64               `json:"presentation_count"`
	AIRulesConfigured bool                `json:"ai_rules_configured"`
	Members           []businessMemberOut `json:"members"`
}

type updateBusinessStatusRequest struct {
	IsActive bool `json:"is_active"`
}

type deleteBusinessRequest struct {
	ConfirmSlug string `json:"confirm_slug"`
}

type impersonateResponse struct {
	AccessToken  string `json:"access_token"`
	UserID       string `json:"user_id"`
	BusinessSlug string `json:"business_slug"`
	RedirectURL  string `json:"redirect_url"`
}

type dashboardOut struct {
	TotalUsers       int64     `json:"total_users"`
	ActiveUsers      int64     `json:"active_users"`
	PendingUsers     int64     `json:"pending_users"`
	SuspendedUsers   int64     `json:"suspended_users"`
	TotalBusinesses  int64     `json:"total_businesses"`
	ActiveBusinesses int64     `json:"active_businesses"`
	RecentSignups    []userOut `json:"recent_signups"`
}

type auditLogOut struct {
	ID         string         `json:"id"`
	AdminID    string         `json:"admin_id"`
	AdminName  string         `json:"admin_name"`
	AdminEmail string         `json:"admin_email"`
	Action     string         `json:"action"`
	TargetType string         `json:"target_type"`
	TargetID   string         `json:"target_id"`
	Metadata   map[string]any `json:"metadata"`
	CreatedAt  string         `json:"created_at"`
}
