-- name: CreateOrder :one
INSERT INTO orders (id, business_id, voice_session_id, status, total, confirmed_at)
VALUES ($1, $2, $3, 'confirmed', $4, NOW())
RETURNING *;

-- name: CreateOrderItem :one
INSERT INTO order_items (id, order_id, product_id, name, price, quantity)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: GetMostRecentOrderForVoiceSession :one
SELECT * FROM orders
WHERE voice_session_id = $1
ORDER BY created_at DESC
LIMIT 1;

-- name: UpdateOrderCustomerName :one
UPDATE orders SET customer_name = $2
WHERE id = $1
RETURNING *;

-- name: ListOrdersForBusiness :many
SELECT * FROM orders WHERE business_id = $1 ORDER BY created_at DESC LIMIT 200;

-- name: ListOrderItemsForOrders :many
SELECT * FROM order_items WHERE order_id = ANY(sqlc.arg('order_ids')::varchar[]);
