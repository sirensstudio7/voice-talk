-- name: CreateAuditLog :one
INSERT INTO audit_logs (id, admin_id, action, target_type, target_id, metadata)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: ListAuditLogs :many
SELECT a.*, p.name AS admin_name, p.email AS admin_email
FROM audit_logs a
JOIN platform_admins p ON p.id = a.admin_id
ORDER BY a.created_at DESC
LIMIT $1 OFFSET $2;

-- name: CountAuditLogs :one
SELECT count(*) FROM audit_logs;

-- name: ListAuditLogsForTarget :many
SELECT a.*, p.name AS admin_name, p.email AS admin_email
FROM audit_logs a
JOIN platform_admins p ON p.id = a.admin_id
WHERE a.target_type = $1 AND a.target_id = $2
ORDER BY a.created_at DESC
LIMIT $3 OFFSET $4;

-- name: CountAuditLogsForTarget :one
SELECT count(*) FROM audit_logs WHERE target_type = $1 AND target_id = $2;
