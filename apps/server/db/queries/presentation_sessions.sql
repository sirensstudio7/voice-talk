-- name: ListPresentationSessionsForBusiness :many
SELECT * FROM presentation_sessions WHERE business_id = $1 ORDER BY created_at DESC;

-- name: GetPresentationSession :one
SELECT * FROM presentation_sessions WHERE id = $1 AND business_id = $2;

-- name: CreatePresentationSession :one
INSERT INTO presentation_sessions (id, presentation_id, business_id, name, enable_qna, auto_start)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: UpdateSessionState :one
UPDATE presentation_sessions SET
  status = $3,
  current_slide_number = $4,
  started_at = COALESCE(started_at, sqlc.narg('started_at')),
  ended_at = COALESCE(sqlc.narg('ended_at'), ended_at),
  updated_at = NOW()
WHERE id = $1 AND business_id = $2
RETURNING *;

-- name: IncrementSessionQuestionCount :exec
UPDATE presentation_sessions SET question_count = question_count + 1, updated_at = NOW() WHERE id = $1 AND business_id = $2;

-- name: SetSessionStatus :exec
UPDATE presentation_sessions SET status = $3, updated_at = NOW() WHERE id = $1 AND business_id = $2;

-- name: UpdateSessionAudienceCount :one
UPDATE presentation_sessions SET audience_count = $3, updated_at = NOW()
WHERE id = $1 AND business_id = $2
RETURNING *;
