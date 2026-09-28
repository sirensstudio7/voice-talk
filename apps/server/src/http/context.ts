/**
 * Framework-agnostic slices of the request context.
 *
 * The auth helpers only ever needed the Authorization header and a way to
 * return an error response, so they take these instead of a framework's
 * request type. Elysia's handler context satisfies both structurally.
 */
export type AuthContext = {
  headers: Record<string, string | undefined>;
  /** Peer address, filled in by the app's `.derive`; empty behind a proxy. */
  ip?: string;
};

export type StatusContext = {
  status: (code: number, body: unknown) => unknown;
};
