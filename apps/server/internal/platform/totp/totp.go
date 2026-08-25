// Package totp wraps TOTP (RFC 6238) secret generation, code validation,
// and QR-code provisioning for platform-admin 2FA enrollment. It's the
// one place github.com/pquerna/otp is imported — internal/modules/**
// call these functions rather than touching the library directly,
// matching internal/modules/doc.go's vendor-SDK isolation convention.
package totp

import (
	"fmt"

	"github.com/pquerna/otp/totp"
	"github.com/skip2/go-qrcode"
)

// GenerateSecret creates a new TOTP secret for an enrolling admin,
// returning both the raw secret (persisted so future codes can be
// validated) and the otpauth:// provisioning URI an authenticator app
// scans to enroll.
func GenerateSecret(issuer, accountName string) (secret, otpauthURL string, err error) {
	key, err := totp.Generate(totp.GenerateOpts{Issuer: issuer, AccountName: accountName})
	if err != nil {
		return "", "", fmt.Errorf("totp: generate secret: %w", err)
	}
	return key.Secret(), key.URL(), nil
}

// Validate checks a 6-digit code against secret, allowing the standard
// +/-1 time-step skew.
func Validate(secret, code string) bool {
	return totp.Validate(code, secret)
}

// QRCodePNG renders otpauthURL as a scannable QR code PNG.
func QRCodePNG(otpauthURL string, size int) ([]byte, error) {
	png, err := qrcode.Encode(otpauthURL, qrcode.Medium, size)
	if err != nil {
		return nil, fmt.Errorf("totp: generate qr code: %w", err)
	}
	return png, nil
}
