// Package tenantlifecycle holds business (tenant) deletion — cross-table
// operational logic no single domain module owns, mirroring the
// internal/capabilities / internal/pricing / internal/scheduling leaf
// packages: importable by any module (today platformadmin; later auth,
// for owner self-service delete) without those modules importing each
// other.
package tenantlifecycle

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/platform/storage"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

// DeleteBusiness permanently removes businessID and everything scoped to
// it. Two of the schema's business-referencing tables (presentations,
// photo_settings/photo_sessions and their sub-tables) already cascade
// from businesses at the DB level; every other table referencing
// business_id does not, so this function deletes them explicitly, in
// dependency order, inside one transaction — the first real transaction
// usage in this codebase (store.Queries.WithTx has existed, generated,
// unused, since the schema was first written).
//
// Storage objects (presentation files, photos, branding assets) live
// outside Postgres and aren't touched by any cascade, so their paths are
// read before the transaction — the rows that reference them are about
// to be cascade-deleted along with the businesses row — and the objects
// themselves are deleted best-effort after the transaction commits:
// storage failures are logged and swallowed rather than rolling back a
// successful DB delete, matching photomoment's cleanup-loop resilience
// posture. storageClient may be nil (storage not configured), in which
// case that step is skipped entirely.
func DeleteBusiness(ctx context.Context, pool *pgxpool.Pool, storageClient *storage.Client, log zerolog.Logger, businessID string) error {
	reader := store.New(pool)

	paths, err := collectStoragePaths(ctx, reader, businessID)
	if err != nil {
		return fmt.Errorf("tenantlifecycle: collect storage paths: %w", err)
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("tenantlifecycle: begin transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }() // no-op after a successful Commit

	q := reader.WithTx(tx)
	deletes := []struct {
		name string
		run  func() error
	}{
		{"transcript_messages", func() error { return q.DeleteBusinessTranscriptMessages(ctx, businessID) }},
		{"orders", func() error { return q.DeleteBusinessOrders(ctx, businessID) }},
		{"voice_sessions", func() error { return q.DeleteBusinessVoiceSessions(ctx, businessID) }},
		{"appointments", func() error { return q.DeleteBusinessAppointments(ctx, businessID) }},
		{"business_hours", func() error { return q.DeleteBusinessHours(ctx, businessID) }},
		{"knowledge_entries", func() error { return q.DeleteBusinessKnowledgeEntries(ctx, businessID) }},
		{"ai_rules", func() error { return q.DeleteBusinessAiRules(ctx, businessID) }},
		{"products", func() error { return q.DeleteBusinessProducts(ctx, businessID) }},
		{"usage_events", func() error { return q.DeleteBusinessUsageEvents(ctx, businessID) }},
		{"business_members", func() error { return q.DeleteBusinessMembersRows(ctx, businessID) }},
		// businesses last — cascades presentations/photo_settings/photo_sessions and their sub-tables.
		{"businesses", func() error { return q.DeleteBusinessRow(ctx, businessID) }},
	}
	for _, d := range deletes {
		if err := d.run(); err != nil {
			return fmt.Errorf("tenantlifecycle: delete %s: %w", d.name, err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("tenantlifecycle: commit: %w", err)
	}

	if storageClient != nil {
		deleteStoragePaths(ctx, storageClient, log, businessID, paths)
	}
	return nil
}

type storagePaths struct {
	presentationFiles []string
	photoPaths        []string
	brandingPaths     []string
}

func collectStoragePaths(ctx context.Context, q *store.Queries, businessID string) (storagePaths, error) {
	var paths storagePaths

	files, err := q.ListPresentationStoragePathsForBusiness(ctx, businessID)
	if err != nil {
		return paths, fmt.Errorf("list presentation storage paths: %w", err)
	}
	paths.presentationFiles = files

	photoRows, err := q.ListPhotoStoragePathsForBusiness(ctx, businessID)
	if err != nil {
		return paths, fmt.Errorf("list photo storage paths: %w", err)
	}
	for _, r := range photoRows {
		if r.PhotoPath.Valid {
			paths.photoPaths = append(paths.photoPaths, r.PhotoPath.String)
		}
		if r.ThumbnailPath.Valid {
			paths.photoPaths = append(paths.photoPaths, r.ThumbnailPath.String)
		}
	}

	branding, err := q.GetPhotoBrandingPathsForBusiness(ctx, businessID)
	if err == nil {
		if branding.LogoUrl.Valid {
			paths.brandingPaths = append(paths.brandingPaths, branding.LogoUrl.String)
		}
		if branding.FrameUrl.Valid {
			paths.brandingPaths = append(paths.brandingPaths, branding.FrameUrl.String)
		}
	}
	// A missing photo_settings row (business never configured Photo
	// Moment) is expected, not an error — every other error is swallowed
	// too, since branding is best-effort cleanup, not correctness-critical.

	return paths, nil
}

func deleteStoragePaths(ctx context.Context, storageClient *storage.Client, log zerolog.Logger, businessID string, paths storagePaths) {
	all := make([]string, 0, len(paths.presentationFiles)+len(paths.photoPaths)+len(paths.brandingPaths))
	all = append(all, paths.presentationFiles...)
	all = append(all, paths.photoPaths...)
	all = append(all, paths.brandingPaths...)

	for _, key := range all {
		if err := storageClient.Delete(ctx, key); err != nil {
			log.Warn().Err(err).Str("business_id", businessID).Str("key", key).Msg("tenantlifecycle: delete storage object after business deletion")
		}
	}
}
