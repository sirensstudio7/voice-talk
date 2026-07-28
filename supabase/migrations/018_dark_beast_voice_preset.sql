-- Rename legacy "venom" preset values to Dark Beast.
UPDATE ai_rules
SET voice_preset = 'dark_beast'
WHERE voice_preset = 'venom';
