-- name: CreateVoiceSession :one
INSERT INTO voice_sessions (id, business_id)
VALUES ($1, $2)
RETURNING *;

-- name: EndVoiceSession :exec
UPDATE voice_sessions SET status = 'ended', end_reason = $2, ended_at = NOW()
WHERE id = $1;

-- name: ListVoiceSessionsForBusiness :many
SELECT * FROM voice_sessions WHERE business_id = $1 ORDER BY started_at DESC LIMIT 200;

-- name: GetVoiceSession :one
SELECT * FROM voice_sessions WHERE id = $1 AND business_id = $2;

-- name: CountSessionsSince :one
SELECT COUNT(*) FROM voice_sessions WHERE business_id = $1 AND started_at >= $2;

-- name: CountActiveSessions :one
SELECT COUNT(*) FROM voice_sessions WHERE business_id = $1 AND status = 'active';

-- name: AvgSessionDurationSeconds :one
-- Returns -1 (a sentinel; duration can never be negative) when there
-- are no matching rows, since sqlc can't infer AVG()'s nullability here
-- and pgx errors scanning SQL NULL into a non-pointer float64.
SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (ended_at - started_at))), -1)::float8 AS avg_seconds
FROM voice_sessions
WHERE business_id = $1 AND status = 'ended' AND ended_at IS NOT NULL;
