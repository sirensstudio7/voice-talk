package storage

import (
	"context"
	"testing"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/config"
)

func TestNew_MissingConfig(t *testing.T) {
	cases := []struct {
		name string
		cfg  config.Config
	}{
		{"empty config", config.Config{}},
		{"missing bucket", config.Config{R2AccountID: "acct123"}},
		{"missing account id", config.Config{R2Bucket: "voicetalk-assets"}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := New(context.Background(), &tc.cfg); err == nil {
				t.Fatalf("expected New() to fail with %+v, got nil error", tc.cfg)
			}
		})
	}
}

func TestNew_ValidConfig(t *testing.T) {
	cfg := &config.Config{
		R2AccountID:       "acct123",
		R2AccessKeyID:     "key",
		R2SecretAccessKey: "secret",
		R2Bucket:          "voicetalk-assets",
	}

	client, err := New(context.Background(), cfg)
	if err != nil {
		t.Fatalf("New() with full config should succeed without network access: %v", err)
	}
	if client == nil {
		t.Fatal("expected non-nil client")
	}
}
