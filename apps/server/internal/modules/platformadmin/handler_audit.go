package platformadmin

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/httpx"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

func (m *Module) listAuditLogs(w http.ResponseWriter, r *http.Request) {
	limit, offset := paginationParams(r)
	targetType := r.URL.Query().Get("target_type")
	targetID := r.URL.Query().Get("target_id")

	if targetType != "" && targetID != "" {
		rows, err := m.store.ListAuditLogsForTarget(r.Context(), store.ListAuditLogsForTargetParams{
			TargetType: targetType, TargetID: targetID, Limit: limit, Offset: offset,
		})
		if err != nil {
			m.deps.Log.Error().Err(err).Msg("platformadmin: list audit logs for target")
			httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load audit logs")
			return
		}
		items := make([]auditLogOut, len(rows))
		for i, a := range rows {
			items[i] = toAuditLogOutForTarget(a)
		}
		httpx.List(w, http.StatusOK, items)
		return
	}

	rows, err := m.store.ListAuditLogs(r.Context(), store.ListAuditLogsParams{Limit: limit, Offset: offset})
	if err != nil {
		m.deps.Log.Error().Err(err).Msg("platformadmin: list audit logs")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load audit logs")
		return
	}
	items := make([]auditLogOut, len(rows))
	for i, a := range rows {
		items[i] = toAuditLogOut(a)
	}
	httpx.List(w, http.StatusOK, items)
}

func toAuditLogOut(a store.ListAuditLogsRow) auditLogOut {
	var metadata map[string]any
	_ = json.Unmarshal(a.Metadata, &metadata)
	return auditLogOut{
		ID: a.ID, AdminID: a.AdminID, AdminName: a.AdminName, AdminEmail: a.AdminEmail,
		Action: a.Action, TargetType: a.TargetType, TargetID: a.TargetID,
		Metadata: metadata, CreatedAt: a.CreatedAt.Time.Format(time.RFC3339),
	}
}

func toAuditLogOutForTarget(a store.ListAuditLogsForTargetRow) auditLogOut {
	var metadata map[string]any
	_ = json.Unmarshal(a.Metadata, &metadata)
	return auditLogOut{
		ID: a.ID, AdminID: a.AdminID, AdminName: a.AdminName, AdminEmail: a.AdminEmail,
		Action: a.Action, TargetType: a.TargetType, TargetID: a.TargetID,
		Metadata: metadata, CreatedAt: a.CreatedAt.Time.Format(time.RFC3339),
	}
}
