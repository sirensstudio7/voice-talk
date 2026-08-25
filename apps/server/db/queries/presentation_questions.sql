-- name: ListPresentationQuestions :many
SELECT * FROM presentation_questions WHERE session_id = $1 ORDER BY created_at;

-- name: CreatePresentationQuestion :one
INSERT INTO presentation_questions (id, session_id, question, status, moderation_result)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: AnswerPresentationQuestion :one
UPDATE presentation_questions SET
  answer = $2,
  status = 'answered',
  source_references = $3,
  answered_at = NOW()
WHERE id = $1
RETURNING *;
