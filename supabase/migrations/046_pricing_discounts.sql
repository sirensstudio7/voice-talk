-- Yearly plan discount and add-on duration discounts.
ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS yearly_discount_percent INTEGER NOT NULL DEFAULT 0;

UPDATE plans
SET yearly_discount_percent = LEAST(
  100,
  GREATEST(
    0,
    ROUND((1 - yearly_price_idr::numeric / NULLIF(monthly_price_idr * 12, 0)) * 100)
  )
)::integer
WHERE monthly_price_idr > 0 AND yearly_price_idr > 0;

ALTER TABLE addons
  ADD COLUMN IF NOT EXISTS discount_3m_percent INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS discount_6m_percent INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS discount_12m_percent INTEGER NOT NULL DEFAULT 15;
