-- Cross-table operational queries backing internal/tenantlifecycle.DeleteBusiness.
-- Not owned by any single domain module — sqlc doesn't care which .sql
-- file a query is defined in, all land in the shared store package.

-- name: ListPresentationStoragePathsForBusiness :many
SELECT pf.storage_path
FROM presentation_files pf
JOIN presentations p ON p.id = pf.presentation_id
WHERE p.business_id = $1;

-- name: ListPhotoStoragePathsForBusiness :many
SELECT photo_path, thumbnail_path
FROM photo_sessions
WHERE business_id = $1 AND (photo_path IS NOT NULL OR thumbnail_path IS NOT NULL);

-- name: GetPhotoBrandingPathsForBusiness :one
SELECT logo_url, frame_url FROM photo_settings WHERE business_id = $1;

-- name: DeleteBusinessTranscriptMessages :exec
DELETE FROM transcript_messages
WHERE voice_session_id IN (SELECT id FROM voice_sessions WHERE business_id = $1);

-- name: DeleteBusinessOrders :exec
DELETE FROM orders WHERE business_id = $1;

-- name: DeleteBusinessVoiceSessions :exec
DELETE FROM voice_sessions WHERE business_id = $1;

-- name: DeleteBusinessAppointments :exec
DELETE FROM appointments WHERE business_id = $1;

-- DeleteBusinessHours already exists in business_hours.sql — reused as-is.

-- name: DeleteBusinessKnowledgeEntries :exec
DELETE FROM knowledge_entries WHERE business_id = $1;

-- name: DeleteBusinessAiRules :exec
DELETE FROM ai_rules WHERE business_id = $1;

-- name: DeleteBusinessProducts :exec
DELETE FROM products WHERE business_id = $1;

-- name: DeleteBusinessUsageEvents :exec
DELETE FROM usage_events WHERE business_id = $1;

-- name: DeleteBusinessMembersRows :exec
DELETE FROM business_members WHERE business_id = $1;

-- name: DeleteBusinessRow :exec
DELETE FROM businesses WHERE id = $1;
