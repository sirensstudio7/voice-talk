-- name: CreateBusinessMember :one
INSERT INTO business_members (id, user_id, business_id, role)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: CheckBusinessMembership :one
SELECT bm.role
FROM business_members bm
JOIN businesses b ON b.id = bm.business_id
WHERE bm.user_id = $1 AND bm.business_id = $2;

-- name: ListBusinessesForUser :many
SELECT b.*, bm.role
FROM businesses b
JOIN business_members bm ON bm.business_id = b.id
WHERE bm.user_id = $1
ORDER BY b.created_at DESC;
