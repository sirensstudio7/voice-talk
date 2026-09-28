-- Stop double bookings at the database level (TKT-002).
--
-- The availability check in services/appointments.ts is a UX optimization: two
-- concurrent creates can both pass it before either insert is visible. An
-- exclusion constraint makes the write itself the guarantee. It needs
-- btree_gist (equality + range overlap in one GiST index).
--
-- Two constraints because unstaffed bookings ("any doctor") semantically hold
-- the whole business, while staffed ones only hold that person:
--   * staffed:   same staff_id + overlapping time  -> conflict
--   * unstaffed: same business + overlapping time -> conflict
--   `staff_id` is nullable, and exclusion constraints never treat NULL = NULL
--   as a conflict, hence the business-scoped second constraint.
--
-- If btree_gist cannot be enabled (restricted managed Postgres), the migration
-- falls back to a partial unique index on (staff_id, starts_at): it only blocks
-- exact-slot races, but no other configuration is lost. Re-running is safe.

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS btree_gist;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE WARNING 'btree_gist could not be enabled; appointment overlap falls back to a unique slot index';
END $$;

-- Pre-flight: fail with the offending ids instead of a generic exclusion error.
DO $$
DECLARE
  a_id VARCHAR(36);
  b_id VARCHAR(36);
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'btree_gist') THEN
    SELECT a.id, b.id
      INTO a_id, b_id
      FROM appointments a
      JOIN appointments b
        ON a.id < b.id
       AND a.status <> 'cancelled'
       AND b.status <> 'cancelled'
       AND (
         a.staff_id = b.staff_id
         OR (a.staff_id IS NULL AND b.staff_id IS NULL AND a.business_id = b.business_id)
       )
       AND tstzrange(a.starts_at, a.ends_at) && tstzrange(b.starts_at, b.ends_at)
      LIMIT 1;
    IF a_id IS NOT NULL THEN
      RAISE EXCEPTION
        'appointments % and % overlap; cancel one of them and re-run migrations',
        a_id, b_id;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'btree_gist') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'appointments_staff_no_overlap'
    ) THEN
      ALTER TABLE appointments
        ADD CONSTRAINT appointments_staff_no_overlap
        EXCLUDE USING gist (staff_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
        WHERE (status <> 'cancelled' AND staff_id IS NOT NULL);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'appointments_business_no_overlap'
    ) THEN
      ALTER TABLE appointments
        ADD CONSTRAINT appointments_business_no_overlap
        EXCLUDE USING gist (business_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
        WHERE (status <> 'cancelled' AND staff_id IS NULL);
    END IF;
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS uq_appointments_staff_start_slot
      ON appointments (staff_id, starts_at)
      WHERE status <> 'cancelled' AND staff_id IS NOT NULL;
  END IF;
END $$;
