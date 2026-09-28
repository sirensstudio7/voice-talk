/**
 * Public error text for API responses.
 *
 * 4xx messages are written for the caller and pass through. 5xx failures must
 * not leak SQL, connection strings, or stack internals, so they collapse to a
 * generic detail. The connection-timeout copy is the one canned exception: it
 * matches the pooled-database failure mode and tells the caller to retry.
 *
 * This is response copy only — the corresponding `http.error` log line carries
 * the full error for operators.
 */
export function publicErrorDetail(error: unknown, statusCode = 500): string {
  const isServerError = statusCode >= 500;
  if (!(error instanceof Error)) return isServerError ? "Internal error" : "Request failed";

  const parts = [error.message];
  if (error.cause instanceof Error) parts.push(error.cause.message);
  const combined = parts.join(" ");
  if (/CONNECT_TIMEOUT|connect timed out|timed out|ECONNREFUSED|connection/i.test(combined)) {
    return "Database connection timed out. Please retry in a moment.";
  }

  if (isServerError) return "Internal error";
  return error.message;
}
