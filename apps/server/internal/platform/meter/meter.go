// Package meter records billable/observable usage events append-only to
// Postgres. Usage data is unbackfillable if the call site is skipped when
// the feature ships, so the package (and this proof of correctness) lands
// now, before any billable domain exists — see the accepted architecture
// review's must-have #2. Real call sites land with the first module that
// actually needs metering (commerce/streaming).
package meter

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

type Meter struct {
	store *store.Queries
}

func New(q *store.Queries) *Meter {
	return &Meter{store: q}
}

// Record appends one usage event. quantity is 1 for count-style events
// (e.g. "http.request"); pass a larger value for duration/byte-based
// events (e.g. voice session seconds, storage bytes).
func (m *Meter) Record(ctx context.Context, businessID, eventType string, quantity float64, metadata map[string]any) error {
	if metadata == nil {
		metadata = map[string]any{}
	}
	metaJSON, err := json.Marshal(metadata)
	if err != nil {
		return fmt.Errorf("meter: marshal metadata: %w", err)
	}

	var qty pgtype.Numeric
	if err := qty.Scan(fmt.Sprintf("%v", quantity)); err != nil {
		return fmt.Errorf("meter: encode quantity: %w", err)
	}

	_, err = m.store.RecordUsageEvent(ctx, store.RecordUsageEventParams{
		ID:         uuid.NewString(),
		BusinessID: businessID,
		EventType:  eventType,
		Quantity:   qty,
		Metadata:   metaJSON,
	})
	if err != nil {
		return fmt.Errorf("meter: record: %w", err)
	}
	return nil
}
