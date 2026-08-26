-- name: CreateTranscriptMessage :one
INSERT INTO transcript_messages (id, voice_session_id, role, text)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: ListTranscriptMessagesForSessions :many
SELECT * FROM transcript_messages
WHERE voice_session_id = ANY(sqlc.arg('session_ids')::varchar[])
ORDER BY created_at;

-- name: ListTranscriptMessagesForSession :many
SELECT * FROM transcript_messages WHERE voice_session_id = $1 ORDER BY created_at;

-- name: CountTranscriptMessagesForSessions :many
SELECT voice_session_id, COUNT(*)::int AS message_count
FROM transcript_messages
WHERE voice_session_id = ANY(sqlc.arg('session_ids')::varchar[])
GROUP BY voice_session_id;
