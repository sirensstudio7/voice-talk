-- name: CreatePhotoSession :one
INSERT INTO photo_sessions (id, business_id, order_id, status)
VALUES ($1, $2, $3, 'started')
RETURNING *;

-- name: GetPhotoSession :one
SELECT * FROM photo_sessions WHERE id = $1 AND business_id = $2;

-- name: SetPhotoSessionResponse :one
UPDATE photo_sessions SET visitor_response = $2, status = $3
WHERE id = $1
RETURNING *;

-- name: SetPhotoSessionUpload :one
UPDATE photo_sessions SET photo_path = $2, thumbnail_path = $3, status = 'captured'
WHERE id = $1
RETURNING *;

-- name: CompletePhotoSession :one
UPDATE photo_sessions SET
  qr_token = COALESCE(qr_token, $2),
  download_expires_at = $3,
  status = 'completed'
WHERE id = $1
RETURNING *;

-- name: GetPhotoSessionByToken :one
SELECT * FROM photo_sessions WHERE qr_token = $1;

-- name: MarkPhotoSessionDownloaded :one
UPDATE photo_sessions SET downloaded_at = NOW()
WHERE id = $1 AND downloaded_at IS NULL
RETURNING *;

-- name: ListPhotoGalleryForBusiness :many
SELECT * FROM photo_sessions
WHERE business_id = $1 AND photo_path IS NOT NULL
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;

-- name: DeletePhotoSession :one
DELETE FROM photo_sessions WHERE id = $1 AND business_id = $2
RETURNING *;

-- name: ExpireQrTokens :execrows
UPDATE photo_sessions SET status = 'expired'
WHERE status = 'completed' AND download_expires_at IS NOT NULL AND download_expires_at < NOW();

-- name: ListExpiredPhotoSessionsForBusiness :many
SELECT * FROM photo_sessions WHERE business_id = $1 AND created_at < $2;

-- name: DeletePhotoSessionByID :exec
DELETE FROM photo_sessions WHERE id = $1;
