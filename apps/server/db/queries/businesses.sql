-- name: GetBusinessBySlug :one
SELECT * FROM businesses WHERE slug = $1;

-- name: GetBusinessByID :one
SELECT * FROM businesses WHERE id = $1;

-- name: CreateBusiness :one
INSERT INTO businesses (id, slug, name)
VALUES ($1, $2, $3)
RETURNING *;

-- name: UpdateBusinessGeneral :one
UPDATE businesses SET
  name = COALESCE(sqlc.narg('name'), name),
  tagline = COALESCE(sqlc.narg('tagline'), tagline),
  voice_name = COALESCE(sqlc.narg('voice_name'), voice_name),
  gemini_model = COALESCE(sqlc.narg('gemini_model'), gemini_model),
  is_active = COALESCE(sqlc.narg('is_active'), is_active)
WHERE id = sqlc.arg('id')
RETURNING *;

-- name: UpdateBusinessOnboarding :one
UPDATE businesses SET
  business_type = $2,
  primary_use_case = $3,
  onboarding_completed = TRUE
WHERE id = $1
RETURNING *;

-- name: UpdateBusinessAppearance :one
UPDATE businesses SET
  gradient_color = COALESCE(sqlc.narg('gradient_color'), gradient_color),
  display_orientation = COALESCE(sqlc.narg('display_orientation'), display_orientation)
WHERE id = sqlc.arg('id')
RETURNING *;

-- name: UpdateBusinessBackgroundURL :one
UPDATE businesses SET background_url = $2 WHERE id = $1
RETURNING *;

-- name: UpdateBusinessPaymentQRURL :one
UPDATE businesses SET payment_qr_url = $2 WHERE id = $1
RETURNING *;
