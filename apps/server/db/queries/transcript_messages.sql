-- name: CreateTranscriptMessage :one
INSERT INTO transcript_messages (id, voice_session_id, role, text)
VALUES ($1, $2, $3, $4)
RETURNING *;
