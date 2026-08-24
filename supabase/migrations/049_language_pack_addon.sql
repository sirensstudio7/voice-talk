-- Language Pack: unlock Russian, Chinese, Uzbek, and more kiosk languages.
INSERT INTO addons (
  id,
  code,
  name,
  description,
  price_display,
  monthly_price_idr,
  sort_order
)
VALUES (
  'addon-language-pack',
  'language_pack',
  'Language Pack',
  'Unlock Russian, Chinese, Uzbek, Japanese, Korean, Arabic, Thai, Vietnamese, Malay, and Turkish on the kiosk and AI Presenter.',
  'Rp199.000/month',
  199000,
  5
)
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_display = EXCLUDED.price_display;
