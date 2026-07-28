INSERT INTO platform_settings (key, value)
VALUES ('require_registration_approval', 'false')
ON CONFLICT (key) DO NOTHING;
