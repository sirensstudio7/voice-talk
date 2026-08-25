-- name: ListBusinessesForPlatform :many
SELECT * FROM businesses
WHERE sqlc.narg('search')::text IS NULL
   OR name ILIKE '%' || sqlc.narg('search')::text || '%'
   OR slug ILIKE '%' || sqlc.narg('search')::text || '%'
ORDER BY created_at DESC
LIMIT $1 OFFSET $2;

-- name: CountBusinessesForPlatform :one
SELECT count(*) FROM businesses
WHERE sqlc.narg('search')::text IS NULL
   OR name ILIKE '%' || sqlc.narg('search')::text || '%'
   OR slug ILIKE '%' || sqlc.narg('search')::text || '%';

-- name: CountActiveBusinesses :one
SELECT count(*) FROM businesses WHERE is_active = TRUE;

-- name: UpdateBusinessStatus :one
UPDATE businesses SET is_active = $2 WHERE id = $1
RETURNING *;

-- name: GetBusinessMemberCount :one
SELECT count(*) FROM business_members WHERE business_id = $1;

-- name: GetBusinessProductCount :one
SELECT count(*) FROM products WHERE business_id = $1;

-- name: GetBusinessPresentationCount :one
SELECT count(*) FROM presentations WHERE business_id = $1;

-- name: HasAIRulesConfigured :one
SELECT EXISTS(SELECT 1 FROM ai_rules WHERE business_id = $1);

-- name: ListBusinessMembersForPlatform :many
SELECT bm.role, u.id AS user_id, u.email, u.name
FROM business_members bm
JOIN users u ON u.id = bm.user_id
WHERE bm.business_id = $1
ORDER BY bm.id;

-- name: GetBusinessOwnerUserID :one
SELECT bm.user_id
FROM business_members bm
WHERE bm.business_id = $1
ORDER BY (bm.role = 'owner') DESC, bm.id
LIMIT 1;
