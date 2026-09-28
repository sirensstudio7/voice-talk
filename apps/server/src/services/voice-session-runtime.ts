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
