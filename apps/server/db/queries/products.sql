-- name: ListProductsForBusiness :many
SELECT * FROM products WHERE business_id = $1 ORDER BY sort_order, name;

-- name: ListActiveProductsForBusiness :many
-- Active only — used by the streaming module's voice tools
-- (search_products, list_treatments) which should never surface a
-- disabled item to a live conversation.
SELECT * FROM products WHERE business_id = $1 AND is_active = TRUE ORDER BY sort_order, name;

-- name: GetProduct :one
SELECT * FROM products WHERE id = $1 AND business_id = $2;

-- name: GetActiveProductBySlug :one
-- Looks up a product by its business-scoped human slug (product_id, not
-- the row's own id) — used by the booking module to validate a
-- treatment exists and is bookable, and will be used by the future
-- voice-ordering flow the same way.
SELECT * FROM products WHERE business_id = $1 AND product_id = $2 AND is_active = TRUE;

-- name: CreateProduct :one
INSERT INTO products (
  id, business_id, product_id, name, price, discount_percent,
  category, description, image_url, is_active, sort_order, duration_min
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
RETURNING *;

-- name: UpdateProduct :one
UPDATE products SET
  product_id = COALESCE(sqlc.narg('product_id'), product_id),
  name = COALESCE(sqlc.narg('name'), name),
  price = COALESCE(sqlc.narg('price'), price),
  discount_percent = COALESCE(sqlc.narg('discount_percent'), discount_percent),
  category = COALESCE(sqlc.narg('category'), category),
  description = COALESCE(sqlc.narg('description'), description),
  image_url = COALESCE(sqlc.narg('image_url'), image_url),
  is_active = COALESCE(sqlc.narg('is_active'), is_active),
  sort_order = COALESCE(sqlc.narg('sort_order'), sort_order),
  duration_min = COALESCE(sqlc.narg('duration_min'), duration_min)
WHERE id = sqlc.arg('id') AND business_id = sqlc.arg('business_id')
RETURNING *;

-- name: DeleteProduct :execrows
DELETE FROM products WHERE id = $1 AND business_id = $2;
