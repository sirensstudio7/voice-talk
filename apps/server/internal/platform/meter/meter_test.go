package meter

import (
	"context"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

// usage_events.business_id has a foreign key to businesses, so this is a
// real integration test against Postgres rather than a pure unit test —
// skipped unless DATABASE_URL is set (e.g. `docker-compose up -d postgres`
// and `go run ./cmd/migrate up` locally first).
func TestRecord(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set; skipping meter integration test")
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("connect to database: %v", err)
	}
	defer pool.Close()

	queries := store.New(pool)

	businessID := uuid.NewString()
	if _, err := queries.CreateBusiness(ctx, store.CreateBusinessParams{
		ID:   businessID,
		Slug: "meter-test-" + businessID[:8],
		Name: "Meter Test Business",
	}); err != nil {
		t.Fatalf("create fixture business: %v", err)
	}

	m := New(queries)
	if err := m.Record(ctx, businessID, "http.request", 1, map[string]any{"path": "/health"}); err != nil {
		t.Fatalf("Record: %v", err)
	}
}
