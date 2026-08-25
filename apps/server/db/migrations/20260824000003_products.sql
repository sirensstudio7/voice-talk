-- +goose Up
-- Ported from apps-legacy/server/src/db/schema.ts's `products` table.
-- product_id is a business-scoped human slug ("latte", "haircut-basic"),
-- distinct from id (the row's own UUID) — kept under that name since the
-- voice-ordering/function-calling flow (streaming module, not yet built)
-- will reference products by it.
CREATE TABLE IF NOT EXISTS products (
  id VARCHAR(36) PRIMARY KEY,
  business_id VARCHAR(36) NOT NULL REFERENCES businesses(id),
  product_id VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  price DOUBLE PRECISION NOT NULL,
  discount_percent DOUBLE PRECISION NOT NULL DEFAULT 0,
  category VARCHAR(100) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  duration_min INTEGER NOT NULL DEFAULT 30,
  CONSTRAINT uq_product_slug UNIQUE (business_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_products_business ON products(business_id);

-- +goose Down
DROP TABLE IF EXISTS products;
