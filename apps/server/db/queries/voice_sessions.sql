-- name: CreateVoiceSession :one
INSERT INTO voice_sessions (id, business_id)
VALUES ($1, $2)
RETURNING *;

-- name: EndVoiceSession :exec
UPDATE voice_sessions SET status = 'ended', end_reason = $2, ended_at = NOW()
WHERE id = $1;
