ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE;

-- Existing businesses were created before enforced onboarding.
UPDATE businesses SET onboarding_completed = TRUE;
