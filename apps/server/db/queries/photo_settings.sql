-- name: GetPhotoSettings :one
SELECT * FROM photo_settings WHERE business_id = $1;

-- name: CreatePhotoSettings :one
INSERT INTO photo_settings (business_id)
VALUES ($1)
ON CONFLICT (business_id) DO UPDATE SET business_id = EXCLUDED.business_id
RETURNING *;

-- name: UpdatePhotoSettings :one
UPDATE photo_settings SET
  enabled = COALESCE(sqlc.narg('enabled'), enabled),
  voice_prompt = COALESCE(sqlc.narg('voice_prompt'), voice_prompt),
  countdown_seconds = COALESCE(sqlc.narg('countdown_seconds'), countdown_seconds),
  qr_expiry_hours = COALESCE(sqlc.narg('qr_expiry_hours'), qr_expiry_hours),
  campaign_text = COALESCE(sqlc.narg('campaign_text'), campaign_text),
  auto_delete_days = COALESCE(sqlc.narg('auto_delete_days'), auto_delete_days),
  updated_at = NOW()
WHERE business_id = sqlc.arg('business_id')
RETURNING *;

-- name: SetPhotoLogoURL :one
UPDATE photo_settings SET logo_url = $2, updated_at = NOW()
WHERE business_id = $1
RETURNING *;

-- name: SetPhotoFrameURL :one
UPDATE photo_settings SET frame_url = $2, updated_at = NOW()
WHERE business_id = $1
RETURNING *;

-- name: ListPhotoSettingsForCleanup :many
SELECT * FROM photo_settings;
