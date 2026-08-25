-- name: ListBusinessHours :many
SELECT * FROM business_hours WHERE business_id = $1 ORDER BY day_of_week;

-- name: CreateBusinessHour :one
INSERT INTO business_hours (id, business_id, day_of_week, open_time, close_time, is_closed)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: DeleteBusinessHours :exec
DELETE FROM business_hours WHERE business_id = $1;
