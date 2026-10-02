const activeVoiceSessions = new Map<string, (reason: string) => void>();

export function registerActiveVoiceSession(
  sessionId: string,
  complete: (reason: string) => void,
): void {
  activeVoiceSessions.set(sessionId, complete);
}

export function unregisterActiveVoiceSession(sessionId: string): void {
  activeVoiceSessions.delete(sessionId);
}

/** Returns true if a live kiosk websocket was told to wrap up. */
export function forceCompleteVoiceSession(sessionId: string, reason = "admin"): boolean {
  const complete = activeVoiceSessions.get(sessionId);
  if (!complete) return false;
  complete(reason);
  return true;
}

/**
 * Apply a `voice.force_end` fanout message (TKT-004). Returns true when this
 * instance owned the session and asked it to wrap up. Kept dependency-free so
 * it can be unit tested without Redis/Postgres.
 */
export function handleRemoteVoiceForceEnd(payload: Record<string, unknown>): boolean {
  const sessionId = typeof payload.voiceSessionId === "string" ? payload.voiceSessionId : "";
  if (!sessionId) return false;
  const reason = typeof payload.reason === "string" && payload.reason ? payload.reason : "admin";
  return forceCompleteVoiceSession(sessionId, reason);
}
