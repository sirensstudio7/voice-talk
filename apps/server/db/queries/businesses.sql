-- name: GetBusinessBySlug :one
SELECT * FROM businesses WHERE slug = $1;

-- name: GetBusinessByID :one
SELECT * FROM businesses WHERE id = $1;

-- name: CreateBusiness :one
INSERT INTO businesses (id, slug, name)
VALUES ($1, $2, $3)
RETURNING *;
