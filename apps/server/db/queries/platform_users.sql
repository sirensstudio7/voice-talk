-- name: ListUsersForPlatform :many
SELECT * FROM users
WHERE sqlc.narg('search')::text IS NULL
   OR email ILIKE '%' || sqlc.narg('search')::text || '%'
   OR name ILIKE '%' || sqlc.narg('search')::text || '%'
ORDER BY created_at DESC
LIMIT $1 OFFSET $2;

-- name: CountUsersForPlatform :one
SELECT count(*) FROM users
WHERE sqlc.narg('search')::text IS NULL
   OR email ILIKE '%' || sqlc.narg('search')::text || '%'
   OR name ILIKE '%' || sqlc.narg('search')::text || '%';

-- name: CountUsersByStatus :one
SELECT count(*) FROM users WHERE status = $1;

-- name: ListRecentUserSignups :many
SELECT * FROM users ORDER BY created_at DESC LIMIT $1;

-- name: UpdateUserStatus :one
UPDATE users SET status = $2 WHERE id = $1
RETURNING *;

-- name: UpdateUserPasswordHash :exec
UPDATE users SET password_hash = $2 WHERE id = $1;

-- name: ListBusinessMembershipsForUser :many
SELECT b.id AS business_id, b.slug, b.name, bm.role
FROM business_members bm
JOIN businesses b ON b.id = bm.business_id
WHERE bm.user_id = $1
ORDER BY b.created_at DESC;
