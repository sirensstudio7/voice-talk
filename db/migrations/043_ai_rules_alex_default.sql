-- New workspaces default to the Alex template (male voice).

ALTER TABLE ai_rules
  ALTER COLUMN assistant_name SET DEFAULT 'Alex';

ALTER TABLE ai_rules
  ALTER COLUMN voice_gender SET DEFAULT 'male';
