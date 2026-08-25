package platformadmin

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

// writeAuditLog records a platform-admin mutating action. An audit-log
// write failure must never block the underlying action it's recording —
// it's logged and swallowed, matching every other best-effort side-effect
// pattern established this session (storage cleanup, meter recording).
func (m *Module) writeAuditLog(ctx context.Context, adminID, action, targetType, targetID string, metadata map[string]any) {
	if metadata == nil {
		metadata = map[string]any{}
	}
	metaJSON, err := json.Marshal(metadata)
	if err != nil {
		m.deps.Log.Warn().Err(err).Str("action", action).Msg("platformadmin: marshal audit log metadata")
		return
	}
	if _, err := m.store.CreateAuditLog(ctx, store.CreateAuditLogParams{
		ID: uuid.NewString(), AdminID: adminID, Action: action, TargetType: targetType, TargetID: targetID, Metadata: metaJSON,
	}); err != nil {
		m.deps.Log.Warn().Err(err).Str("action", action).Str("target_id", targetID).Msg("platformadmin: write audit log")
	}
}
