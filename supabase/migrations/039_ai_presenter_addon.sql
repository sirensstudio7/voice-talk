-- AI Presenter as a paid add-on (presentations tables already exist from 030).
INSERT INTO addons (id, code, name, description, price_display, sort_order)
VALUES (
  'addon-ai-presenter',
  'ai_presenter',
  'AI Presenter',
  'Upload decks, generate slide narration, and run live AI presentation sessions.',
  'Rp199.000/month',
  3
)
ON CONFLICT (code) DO NOTHING;
