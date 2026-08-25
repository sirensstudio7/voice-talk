-- name: RecordUsageEvent :one
INSERT INTO usage_events (id, business_id, event_type, quantity, metadata)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: CountUsageEventsSince :one
SELECT count(*) FROM usage_events
WHERE business_id = $1 AND event_type = $2 AND occurred_at >= $3;
