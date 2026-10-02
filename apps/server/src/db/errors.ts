/**
 * Postgres error inspection helpers.
 *
 * The Bun SQL driver wraps server errors in `DrizzleQueryError`, so the actual
 * SQLSTATE (`errno`/`code`) and constraint name live on `cause`. These walk the
 * chain instead of trusting the outer error.
 */

const SQLSTATE = /^[0-9A-Z]{5}$/;

export function postgresErrorCode(err: unknown): string | null {
  let current: unknown = err;
  for (let depth = 0; current && depth < 5; depth += 1) {
    if (typeof current !== "object") return null;
    const candidate = current as { errno?: unknown; code?: unknown; cause?: unknown };
    for (const value of [candidate.errno, candidate.code]) {
      if (typeof value === "string" && SQLSTATE.test(value)) return value;
    }
    current = candidate.cause;
  }
  return null;
}

/** True when the write lost an appointment overlap/unique race (23P01/23505). */
export function isAppointmentOverlapError(err: unknown): boolean {
  const code = postgresErrorCode(err);
  if (code === "23P01" || code === "23505") return true;
  let current: unknown = err;
  for (let depth = 0; current && depth < 5; depth += 1) {
    if (typeof current !== "object") break;
    const message = (current as { message?: unknown }).message;
    if (
      typeof message === "string" &&
      /violates exclusion constraint|duplicate key value violates unique constraint/i.test(message)
    ) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
