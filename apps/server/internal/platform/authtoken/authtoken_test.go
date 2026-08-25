package authtoken

import (
	"testing"
	"time"
)

func TestIssueParse_RoundTrip(t *testing.T) {
	token, err := Issue("secret", "user-123", time.Hour)
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}

	userID, err := Parse("secret", token)
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if userID != "user-123" {
		t.Fatalf("got userID %q, want %q", userID, "user-123")
	}
}

func TestParse_WrongSecret(t *testing.T) {
	token, err := Issue("secret", "user-123", time.Hour)
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}
	if _, err := Parse("wrong-secret", token); err != ErrInvalidToken {
		t.Fatalf("got err %v, want ErrInvalidToken", err)
	}
}

func TestParse_Expired(t *testing.T) {
	token, err := Issue("secret", "user-123", -time.Hour)
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}
	if _, err := Parse("secret", token); err != ErrInvalidToken {
		t.Fatalf("got err %v, want ErrInvalidToken", err)
	}
}

func TestParse_Malformed(t *testing.T) {
	if _, err := Parse("secret", "not-a-token"); err != ErrInvalidToken {
		t.Fatalf("got err %v, want ErrInvalidToken", err)
	}
}
