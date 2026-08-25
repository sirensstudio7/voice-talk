package platformadmin

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/httpx"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/platform/authtoken"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/platform/totp"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

const (
	pendingTokenTTL = 10 * time.Minute
	fullTokenTTL    = 8 * time.Hour
	totpIssuer      = "Lorescale Platform"
	qrCodeSize      = 256
)

func (m *Module) login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "invalid request body")
		return
	}

	admin, err := m.store.GetPlatformAdminByEmail(r.Context(), req.Email)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusUnauthorized, "invalid_credentials", "invalid email or password")
			return
		}
		m.deps.Log.Error().Err(err).Msg("platformadmin: get admin by email")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to log in")
		return
	}
	if admin.Status != "active" || !verifyPassword(req.Password, admin.PasswordHash) {
		httpx.Error(w, http.StatusUnauthorized, "invalid_credentials", "invalid email or password")
		return
	}

	pendingToken, err := authtoken.IssuePlatformToken(m.deps.JWTSecret, admin.ID, admin.Role, tokenTypPending, pendingTokenTTL)
	if err != nil {
		m.deps.Log.Error().Err(err).Msg("platformadmin: issue pending token")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to log in")
		return
	}

	status := "totp_required"
	if !admin.TotpEnabled {
		status = "totp_setup_required"
	}
	httpx.JSON(w, http.StatusOK, loginResponse{Status: status, PendingToken: pendingToken})
}

func (m *Module) setup2FA(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.PlatformAccessFromContext(r.Context())

	admin, err := m.store.GetPlatformAdminByID(r.Context(), access.AdminID)
	if err != nil {
		m.deps.Log.Error().Err(err).Msg("platformadmin: get admin for 2fa setup")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to set up 2fa")
		return
	}
	if admin.TotpEnabled {
		httpx.Error(w, http.StatusConflict, "totp_already_enabled", "two-factor authentication is already enabled")
		return
	}

	secret, otpauthURL, err := totp.GenerateSecret(totpIssuer, admin.Email)
	if err != nil {
		m.deps.Log.Error().Err(err).Msg("platformadmin: generate totp secret")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to set up 2fa")
		return
	}
	if _, err := m.store.SetPlatformAdminTOTP(r.Context(), store.SetPlatformAdminTOTPParams{
		ID: admin.ID, TotpSecret: pgTextArg(secret), TotpEnabled: false,
	}); err != nil {
		m.deps.Log.Error().Err(err).Msg("platformadmin: save totp secret")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to set up 2fa")
		return
	}

	png, err := totp.QRCodePNG(otpauthURL, qrCodeSize)
	if err != nil {
		m.deps.Log.Error().Err(err).Msg("platformadmin: generate totp qr code")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to set up 2fa")
		return
	}

	httpx.JSON(w, http.StatusOK, setup2FAResponse{
		Secret: secret, OtpauthURL: otpauthURL, QRCodePNG: base64.StdEncoding.EncodeToString(png),
	})
}

func (m *Module) verify2FA(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.PlatformAccessFromContext(r.Context())

	var req verify2FARequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "invalid request body")
		return
	}

	admin, err := m.store.GetPlatformAdminByID(r.Context(), access.AdminID)
	if err != nil {
		m.deps.Log.Error().Err(err).Msg("platformadmin: get admin for 2fa verify")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to verify 2fa")
		return
	}
	if !admin.TotpSecret.Valid || !totp.Validate(admin.TotpSecret.String, req.Code) {
		httpx.Error(w, http.StatusUnauthorized, "invalid_code", "invalid or expired code")
		return
	}

	if !admin.TotpEnabled {
		if _, err := m.store.SetPlatformAdminTOTP(r.Context(), store.SetPlatformAdminTOTPParams{
			ID: admin.ID, TotpSecret: admin.TotpSecret, TotpEnabled: true,
		}); err != nil {
			m.deps.Log.Error().Err(err).Msg("platformadmin: enable totp")
			httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to verify 2fa")
			return
		}
	}
	if err := m.store.UpdatePlatformAdminLastLogin(r.Context(), admin.ID); err != nil {
		m.deps.Log.Warn().Err(err).Msg("platformadmin: update last login")
	}

	fullToken, err := authtoken.IssuePlatformToken(m.deps.JWTSecret, admin.ID, admin.Role, tokenTypFull, fullTokenTTL)
	if err != nil {
		m.deps.Log.Error().Err(err).Msg("platformadmin: issue full token")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to verify 2fa")
		return
	}
	httpx.JSON(w, http.StatusOK, verify2FAResponse{AccessToken: fullToken})
}

func (m *Module) me(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.PlatformAccessFromContext(r.Context())

	admin, err := m.store.GetPlatformAdminByID(r.Context(), access.AdminID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "admin_not_found", "admin not found")
			return
		}
		m.deps.Log.Error().Err(err).Msg("platformadmin: get admin for me")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load profile")
		return
	}
	httpx.JSON(w, http.StatusOK, toAdminOut(admin))
}
