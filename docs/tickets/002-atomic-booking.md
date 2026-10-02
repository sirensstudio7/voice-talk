# TKT-002 — Atomic booking (no double-book)

- **Status:** in-progress (code + migration 067 on `feat/multi-instance-hardening`)
- **Priority:** P0
- **Area:** booking
- **Effort:** M (2–4 days)
- **Depends on:** —
- **Source:** feature inventory review, 2026-09-29

## Problem

Booking tells a visitor "that slot is taken / is yours" based on a check that is
not atomic with the insert. Two visitors (or a visitor and the admin) booking the
same staff member at the same time can both pass the availability check and both
insert an appointment — a double booking the merchant has to clean up in person.

## Evidence

- `apps/server/src/services/appointments.ts` — `createAppointment()` calls
  `getAvailableSlots()` and then inserts, with no transaction or lock between.
- Slot generation (`services/booking.ts`) excludes overlapping non-cancelled
  appointments, so it is only as correct as the read-then-write window.
- The voice tool `book_appointment` and the public HTTP route both funnel into
  the same function, so both are exposed.

## Proposal

Guard the write with a database-level invariant and a friendly retry:

1. Add migration: `btree_gist` extension +
   `EXCLUDE USING gist (staff_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
   WHERE (status <> 'cancelled')` on `appointments` (skip when `staff_id` is
   null; optionally a second constraint on `business_id` for unstaffed slots).
2. Wrap create in a transaction; map the exclusion violation to a typed
   `SlotTakenError` and return a 409 / voice-friendly "that slot was just taken,
   want the next one?".
3. Keep the availability pre-check for UX; it becomes an optimization, not the
   guarantee.

Alternatives considered: advisory lock per `(staff, day)` — portable but easier
to forget in future call paths; serializable isolation — heavier and still needs
retry handling.

## Acceptance criteria

- [x] Two parallel `createAppointment` calls for the same staff/time: exactly one
      row exists; the loser gets a structured conflict error.
      (`tests/booking-guard.test.ts`, staffed and unstaffed cases.)
- [x] Voice path surfaces the conflict as a spoken alternative, not a crash
      (`book_appointment` returns the error plus up to three `alternatives`).
- [x] Cancelled appointments free the slot (exclusion predicate verified in the
      same test).
- [x] Migration is idempotent (re-ran against a scratch database) and aborts
      with the offending ids when existing overlaps are present.

## Implementation notes

- `db/migrations/067_appointment_overlap_guard.sql`: enables `btree_gist`, then
  adds `appointments_staff_no_overlap` (staffed) and
  `appointments_business_no_overlap` (unstaffed) exclusion constraints. When the
  extension cannot be enabled it falls back to
  `uq_appointments_staff_start_slot` (exact-slot unique index) and raises a
  warning.
- `services/appointments.ts` maps `23P01`/`23505` (including Bun's
  `DrizzleQueryError` wrapper, via `db/errors.ts`) to `SlotTakenError`
  (status 409, counter `booking.slot_conflict_total`). The public route now
  responds 409; previously every failure was a 400.
- Deleting a doctor whose appointments overlap unassigned bookings is rejected
  with a 409 explaining the conflict (`services/booking.ts` `deleteStaff`).
- Deployment note: run `bun run seed:db` before rolling the code; if it aborts on
  pre-flight, cancel the listed overlapping appointments and re-run.

## Out of scope

- Calendar sync / external availability.
- Recurring appointments.

## Rollout / risk

Migration must run before the code ships. If the extension cannot be enabled on
the managed Postgres plan, fall back to a partial unique index on
`(staff_id, starts_at)` for the common 15-minute grid and keep the transaction.
