-- name: ListPresentationsForBusiness :many
SELECT * FROM presentations WHERE business_id = $1 AND deleted_at IS NULL ORDER BY updated_at DESC;

-- name: GetPresentation :one
SELECT * FROM presentations WHERE id = $1 AND business_id = $2 AND deleted_at IS NULL;

-- name: CreatePresentation :one
INSERT INTO presentations (id, business_id, created_by, title, description, language, category)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: UpdatePresentationDetails :one
UPDATE presentations SET
  title = COALESCE(sqlc.narg('title'), title),
  description = COALESCE(sqlc.narg('description'), description),
  language = COALESCE(sqlc.narg('language'), language),
  category = COALESCE(sqlc.narg('category'), category),
  updated_at = NOW()
WHERE id = sqlc.arg('id') AND business_id = sqlc.arg('business_id') AND deleted_at IS NULL
RETURNING *;

-- name: SoftDeletePresentation :execrows
UPDATE presentations SET deleted_at = NOW(), status = 'archived', updated_at = NOW()
WHERE id = $1 AND business_id = $2 AND deleted_at IS NULL;

-- name: SetPresentationStatus :exec
UPDATE presentations SET status = $3, processing_step = $4, processing_error = $5, updated_at = NOW()
WHERE id = $1 AND business_id = $2;

-- name: CompletePresentationProcessing :exec
UPDATE presentations SET
  status = 'ready',
  processing_step = 'completed',
  processing_error = '',
  greeting_script = $3,
  closing_script = $4,
  estimated_duration = $5,
  total_slides = $6,
  updated_at = NOW()
WHERE id = $1 AND business_id = $2;

-- name: SetPresentationLive :exec
UPDATE presentations SET status = 'live', updated_at = NOW() WHERE id = $1 AND business_id = $2;

-- name: CompletePresentation :exec
UPDATE presentations SET status = 'completed', updated_at = NOW() WHERE id = $1 AND business_id = $2;

-- name: ResetPresentationToDraft :exec
UPDATE presentations SET status = 'draft', updated_at = NOW() WHERE id = $1 AND business_id = $2;
