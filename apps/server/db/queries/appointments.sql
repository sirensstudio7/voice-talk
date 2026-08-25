-- name: ListAppointments :many
SELECT * FROM appointments
WHERE business_id = $1
  AND (sqlc.narg('starts_after')::timestamptz IS NULL OR starts_at >= sqlc.narg('starts_after'))
  AND (sqlc.narg('starts_before')::timestamptz IS NULL OR starts_at < sqlc.narg('starts_before'))
ORDER BY starts_at;

-- name: ListActiveAppointmentsInRange :many
SELECT * FROM appointments
WHERE business_id = $1
  AND starts_at >= $2
  AND starts_at < $3
  AND status != 'cancelled';

-- name: GetAppointment :one
SELECT * FROM appointments WHERE id = $1 AND business_id = $2;

-- name: CreateAppointment :one
INSERT INTO appointments (
  id, business_id, product_id, treatment_name, customer_name, customer_phone, starts_at, ends_at
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: CancelAppointment :one
UPDATE appointments SET status = 'cancelled'
WHERE id = $1 AND business_id = $2
RETURNING *;
