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

-- name: ListOrdersForVoiceSessions :many
SELECT * FROM orders WHERE voice_session_id = ANY(sqlc.arg('session_ids')::varchar[]);

-- name: CountConfirmedOrdersSince :one
SELECT COUNT(*) AS orders_count, COALESCE(SUM(total), 0)::float8 AS revenue
FROM orders
WHERE business_id = $1 AND status = 'confirmed' AND confirmed_at >= $2;

-- name: DailyConfirmedOrderStats :many
SELECT to_char(confirmed_at, 'YYYY-MM-DD') AS day, COUNT(*)::int AS orders, COALESCE(SUM(total), 0)::float8 AS revenue
FROM orders
WHERE business_id = $1 AND status = 'confirmed' AND confirmed_at >= $2
GROUP BY day;

-- name: TopProductsForBusiness :many
SELECT order_items.product_id, order_items.name,
  SUM(order_items.quantity)::int AS quantity,
  SUM(order_items.price * order_items.quantity)::float8 AS revenue
FROM order_items
JOIN orders ON orders.id = order_items.order_id
WHERE orders.business_id = $1 AND orders.status = 'confirmed'
GROUP BY order_items.product_id, order_items.name
ORDER BY SUM(order_items.quantity) DESC
LIMIT 10;
