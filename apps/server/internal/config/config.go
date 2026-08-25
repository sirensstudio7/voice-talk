// Package config loads runtime configuration from environment variables.
package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Env  string
	Port string

	DatabaseURL      string
	DBMaxConns       int32
	DBMinConns       int32
	DBMaxConnIdle    time.Duration
	DBConnectTimeout time.Duration

	RedisURL string

	JWTSecret      string
	JWTExpireHours int

	GeminiAPIKey string
	GeminiModel  string

	AllowedOrigins []string

	// R2 (Cloudflare object storage) — optional. Load() never fails on
	// these being unset; internal/platform/storage.New() fails only when
	// actually constructed without R2AccountID/R2Bucket. Local dev has no
	// storage backend until a module that uploads something exists.
	R2AccountID       string
	R2AccessKeyID     string
	R2SecretAccessKey string
	R2Bucket          string
	R2PublicBaseURL   string

	// Platform admin — optional. platformadmin.New() seeds a single
	// super-role admin from these on boot if platform_admins is empty;
	// unset means the panel has no way to log in until an admin is
	// created some other way (same "warn and skip" posture as R2).
	PlatformAdminEmail    string
	PlatformAdminPassword string
	// MerchantAdminURL is the impersonation redirect target — blank until
	// a merchant admin frontend actually exists.
	MerchantAdminURL string
}

// Load reads configuration from the environment. It does not read .env
// files itself — invoke godotenv.Load() (or the platform equivalent)
// before calling Load() in local development.
func Load() (*Config, error) {
	cfg := &Config{
		Env:  getEnv("APP_ENV", "development"),
		Port: getEnv("PORT", "8000"),

		DatabaseURL:      os.Getenv("DATABASE_URL"),
		DBMaxConns:       int32(getEnvInt("DB_MAX_CONNS", 15)),
		DBMinConns:       int32(getEnvInt("DB_MIN_CONNS", 2)),
		DBMaxConnIdle:    getEnvDuration("DB_MAX_CONN_IDLE", 5*time.Minute),
		DBConnectTimeout: getEnvDuration("DB_CONNECT_TIMEOUT", 10*time.Second),

		RedisURL: os.Getenv("REDIS_URL"),

		JWTSecret:      getEnv("JWT_SECRET", "dev-secret-change-in-production"),
		JWTExpireHours: getEnvInt("JWT_EXPIRE_HOURS", 72),

		GeminiAPIKey: os.Getenv("GEMINI_API_KEY"),
		GeminiModel:  getEnv("GEMINI_MODEL", "gemini-3.1-flash-live-preview"),

		AllowedOrigins: splitCSV(getEnv("ALLOWED_ORIGINS", "http://localhost:6670,http://localhost:6680,http://localhost:6681,http://localhost:6690")),

		R2AccountID:       os.Getenv("R2_ACCOUNT_ID"),
		R2AccessKeyID:     os.Getenv("R2_ACCESS_KEY_ID"),
		R2SecretAccessKey: os.Getenv("R2_SECRET_ACCESS_KEY"),
		R2Bucket:          os.Getenv("R2_BUCKET"),
		R2PublicBaseURL:   os.Getenv("R2_PUBLIC_BASE_URL"),

		PlatformAdminEmail:    os.Getenv("PLATFORM_ADMIN_EMAIL"),
		PlatformAdminPassword: os.Getenv("PLATFORM_ADMIN_PASSWORD"),
		MerchantAdminURL:      os.Getenv("MERCHANT_ADMIN_URL"),
	}

	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("config: DATABASE_URL is required")
	}

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return n
}

func getEnvDuration(key string, fallback time.Duration) time.Duration {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	d, err := time.ParseDuration(v)
	if err != nil {
		return fallback
	}
	return d
}

func splitCSV(v string) []string {
	if v == "" {
		return nil
	}
	parts := strings.Split(v, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}
