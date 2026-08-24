-- Snapshot prize name on winners so prizes can be hard-deleted without losing history.
ALTER TABLE lucky_spin_winners
  ADD COLUMN IF NOT EXISTS prize_name VARCHAR(255) NOT NULL DEFAULT '';

UPDATE lucky_spin_winners AS w
SET prize_name = p.name
FROM lucky_spin_prizes AS p
WHERE w.prize_id = p.id
  AND (w.prize_name = '' OR w.prize_name IS NULL);

ALTER TABLE lucky_spin_winners
  ALTER COLUMN prize_id DROP NOT NULL;

ALTER TABLE lucky_spin_winners
  DROP CONSTRAINT IF EXISTS lucky_spin_winners_prize_id_fkey;

ALTER TABLE lucky_spin_winners
  ADD CONSTRAINT lucky_spin_winners_prize_id_fkey
  FOREIGN KEY (prize_id) REFERENCES lucky_spin_prizes(id) ON DELETE SET NULL;
