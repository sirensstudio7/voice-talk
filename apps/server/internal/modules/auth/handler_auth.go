package auth

import (
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/httpx"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/platform/authtoken"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

var emailPattern = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)

type authResponse struct {
	AccessToken string  `json:"access_token"`
	TokenType   string  `json:"token_type"`
	User        userOut `json:"user"`
}

type signupRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Name     string `json:"name"`
}

// signup creates a new user account. Every account is active immediately
// — there is no admin-approval workflow in this rewrite yet (that was
// gated by a platform_settings flag the legacy app read; no
// platform-admin module exists in Go yet to manage it). Revisit if/when
// that module lands.
func (m *Module) signup(w http.ResponseWriter, r *http.Request) {
	var req signupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "invalid request body")
		return
	}

	email := strings.ToLower(strings.TrimSpace(req.Email))
	if email == "" || req.Password == "" {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "email and password are required")
		return
	}
	if !emailPattern.MatchString(email) {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "enter a valid email address")
		return
	}
	if len(req.Password) < 8 {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "password must be at least 8 characters")
		return
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		if at := strings.Index(email, "@"); at > 0 {
			name = email[:at]
		} else {
			name = "User"
		}
	}

	passwordHash, err := hashPassword(req.Password)
	if err != nil {
		m.deps.Log.Error().Err(err).Msg("hash password")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to create account")
		return
	}

	user, err := m.store.CreateUser(r.Context(), store.CreateUserParams{
		ID:           uuid.NewString(),
		Email:        email,
		PasswordHash: passwordHash,
		Name:         name,
	})
	if err != nil {
		if isUniqueViolation(err) {
			httpx.Error(w, http.StatusConflict, "email_taken", "email already exists")
			return
		}
		m.deps.Log.Error().Err(err).Msg("create user")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to create account")
		return
	}

	token, err := authtoken.Issue(m.deps.JWTSecret, user.ID, m.tokenTTL())
	if err != nil {
		m.deps.Log.Error().Err(err).Msg("issue token")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to create account")
		return
	}

	httpx.JSON(w, http.StatusCreated, authResponse{
		AccessToken: token,
		TokenType:   "bearer",
		User:        toUserOut(user),
	})
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type loginResponse struct {
	AccessToken string          `json:"access_token"`
	TokenType   string          `json:"token_type"`
	User        userOut         `json:"user"`
	Businesses  []myBusinessOut `json:"businesses"`
}

func (m *Module) login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "invalid request body")
		return
	}

	email := strings.ToLower(strings.TrimSpace(req.Email))
	user, err := m.store.GetUserByEmail(r.Context(), email)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusUnauthorized, "invalid_credentials", "invalid credentials")
			return
		}
		m.deps.Log.Error().Err(err).Msg("get user by email")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "login failed")
		return
	}

	if !verifyPassword(req.Password, user.PasswordHash) {
		httpx.Error(w, http.StatusUnauthorized, "invalid_credentials", "invalid credentials")
		return
	}
	if user.Status == "suspended" {
		httpx.Error(w, http.StatusForbidden, "account_suspended", "account suspended")
		return
	}
	if user.Status == "pending" {
		httpx.Error(w, http.StatusForbidden, "account_pending", "your account is awaiting admin approval")
		return
	}

	if err := m.store.UpdateUserLastLogin(r.Context(), user.ID); err != nil {
		m.deps.Log.Error().Err(err).Str("user_id", user.ID).Msg("update last login")
	}

	businesses, err := m.store.ListBusinessesForUser(r.Context(), user.ID)
	if err != nil {
		m.deps.Log.Error().Err(err).Str("user_id", user.ID).Msg("list businesses for user")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "login failed")
		return
	}
	businessesOut := make([]myBusinessOut, 0, len(businesses))
	for _, b := range businesses {
		businessesOut = append(businessesOut, toMyBusinessOut(b))
	}

	token, err := authtoken.Issue(m.deps.JWTSecret, user.ID, m.tokenTTL())
	if err != nil {
		m.deps.Log.Error().Err(err).Msg("issue token")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "login failed")
		return
	}

	httpx.JSON(w, http.StatusOK, loginResponse{
		AccessToken: token,
		TokenType:   "bearer",
		User:        toUserOut(user),
		Businesses:  businessesOut,
	})
}

func (m *Module) getMe(w http.ResponseWriter, r *http.Request) {
	userID, ok := httpx.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "not_authenticated", "not authenticated")
		return
	}

	user, err := m.store.GetUserByID(r.Context(), userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusUnauthorized, "not_authenticated", "not authenticated")
			return
		}
		m.deps.Log.Error().Err(err).Str("user_id", userID).Msg("get user by id")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load account")
		return
	}

	httpx.JSON(w, http.StatusOK, toUserOut(user))
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}
