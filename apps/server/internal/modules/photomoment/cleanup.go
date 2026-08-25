package photomoment

import (
	"context"
	"time"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

const (
	expireTickInterval  = time.Hour
	cleanupTickInterval = 24 * time.Hour
)

// runCleanupLoop mirrors legacy's two in-process timers: an hourly sweep
// that flips completed sessions past download_expires_at to "expired"
// (a housekeeping/listing convenience — handler_download.go's live check
// is the real enforcement point, independent of this job ever running),
// and a daily per-business sweep that deletes sessions older than each
// business's own auto_delete_days retention window, storage objects
// included. A single goroutine with two tickers is appropriate for the
// current single-instance, pre-launch deployment; it runs for the process
// lifetime rather than taking a shutdown context, since nothing here is
// unsafe to interrupt mid-tick.
func (m *Module) runCleanupLoop(ctx context.Context) {
	expireTicker := time.NewTicker(expireTickInterval)
	defer expireTicker.Stop()
	cleanupTicker := time.NewTicker(cleanupTickInterval)
	defer cleanupTicker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-expireTicker.C:
			m.expireQrTokens(ctx)
		case <-cleanupTicker.C:
			m.sweepRetention(ctx)
		}
	}
}

func (m *Module) expireQrTokens(ctx context.Context) {
	n, err := m.store.ExpireQrTokens(ctx)
	if err != nil {
		m.deps.Log.Error().Err(err).Msg("photomoment: expire qr tokens")
		return
	}
	if n > 0 {
		m.deps.Log.Info().Int64("count", n).Msg("photomoment: expired qr tokens")
	}
}

func (m *Module) sweepRetention(ctx context.Context) {
	settingsList, err := m.store.ListPhotoSettingsForCleanup(ctx)
	if err != nil {
		m.deps.Log.Error().Err(err).Msg("photomoment: list settings for retention sweep")
		return
	}

	for _, settings := range settingsList {
		days := settings.AutoDeleteDays
		if days <= 0 {
			continue
		}
		cutoff := time.Now().Add(-time.Duration(days) * 24 * time.Hour)

		sessions, err := m.store.ListExpiredPhotoSessionsForBusiness(ctx, store.ListExpiredPhotoSessionsForBusinessParams{
			BusinessID: settings.BusinessID, CreatedAt: pgtypeTimestamptz(cutoff),
		})
		if err != nil {
			m.deps.Log.Error().Err(err).Str("business_id", settings.BusinessID).Msg("photomoment: list expired sessions")
			continue
		}

		for _, s := range sessions {
			if m.deps.Storage != nil {
				if s.PhotoPath.Valid {
					if err := m.deps.Storage.Delete(ctx, s.PhotoPath.String); err != nil {
						m.deps.Log.Warn().Err(err).Str("session_id", s.ID).Msg("photomoment: delete expired photo from storage")
					}
				}
				if s.ThumbnailPath.Valid {
					if err := m.deps.Storage.Delete(ctx, s.ThumbnailPath.String); err != nil {
						m.deps.Log.Warn().Err(err).Str("session_id", s.ID).Msg("photomoment: delete expired thumbnail from storage")
					}
				}
			}
			if err := m.store.DeletePhotoSessionByID(ctx, s.ID); err != nil {
				m.deps.Log.Error().Err(err).Str("session_id", s.ID).Msg("photomoment: delete expired session row")
			}
		}
	}
}
