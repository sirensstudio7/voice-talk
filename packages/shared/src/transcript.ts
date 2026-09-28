function collapseSpace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function stripTrailingPunct(text: string): string {
  return text.replace(/[?!.,;:]+$/g, "");
}

/**
 * Join streaming STT / Gemini Live output chunks into one utterance.
 * Chunks may be cumulative, deltas, or a repeated tail ("bantu?").
 */
export function mergeTranscriptChunk(existing: string, incoming: string): string {
  if (!existing) return incoming;
  if (!incoming) return existing;
  if (incoming === existing) return existing;
  if (incoming.startsWith(existing)) return incoming;
  if (existing.startsWith(incoming)) return existing;
  if (existing.endsWith(incoming)) return existing;
  if (
    existing.trim().length >= 4 &&
    incoming.endsWith(existing) &&
    incoming.length > existing.length
  ) {
    return incoming;
  }

  const a = collapseSpace(existing);
  const b = collapseSpace(incoming);
  if (!a) return incoming;
  if (!b) return existing;
  if (a === b) return existing.length >= incoming.length ? existing : incoming;

  const aCore = stripTrailingPunct(a);
  const bCore = stripTrailingPunct(b);
  if (bCore.length >= 4 && a.toLowerCase().includes(b.toLowerCase())) return existing;
  if (bCore.length >= 4 && aCore.toLowerCase().endsWith(bCore.toLowerCase())) return existing;
  if (aCore.length >= 4 && b.toLowerCase().includes(a.toLowerCase())) return incoming;
  if (aCore.length >= 4 && bCore.toLowerCase().endsWith(aCore.toLowerCase())) return incoming;

  const maxOverlap = Math.min(existing.length, incoming.length);
  for (let size = maxOverlap; size > 0; size -= 1) {
    if (existing.slice(-size) === incoming.slice(0, size)) {
      return existing + incoming.slice(size);
    }
  }

  const aTail = stripTrailingPunct(a.split(" ").pop() ?? "").toLowerCase();
  const bHead = stripTrailingPunct(b.split(" ")[0] ?? "").toLowerCase();
  if (aTail && aTail === bHead) {
    const rest = b.split(" ").slice(1).join(" ");
    return rest ? `${existing.replace(/\s+$/, "")}${existing.endsWith(" ") ? "" : " "}${rest}` : existing;
  }

  const needsSpace =
    !/\s$/.test(existing) &&
    !/^\s/.test(incoming) &&
    !/^[.,!?;:'"')\]}>—-]/.test(incoming);

  return needsSpace ? `${existing} ${incoming}` : `${existing}${incoming}`;
}

/**
 * True when `incoming` is the rest of the same spoken line, not a new turn.
 * Used so premature Gemini `turn_complete` does not split "…saya bantu?" into
 * a second bubble that only says "bantu?".
 */
export function isAssistantTranscriptContinuation(existing: string, incoming: string): boolean {
  const current = collapseSpace(existing);
  const next = collapseSpace(incoming);
  if (!current || !next) return false;
  if (current.toLowerCase() === next.toLowerCase()) return true;

  const merged = mergeTranscriptChunk(existing, incoming);
  if (merged === existing) return true;
  if (merged === incoming && incoming.length > existing.length) {
    const a = current.toLowerCase();
    const b = next.toLowerCase();
    if (b.includes(a) || a.includes(b)) return true;
  }

  const maxOverlap = Math.min(existing.length, incoming.length);
  for (let size = maxOverlap; size >= 4; size -= 1) {
    if (existing.slice(-size) === incoming.slice(0, size)) return true;
  }

  const nextWords = next.split(" ");
  const currentClosed = /[.!?…]$/.test(current);
  if (!currentClosed && nextWords.length <= 3 && next.length <= 40) return true;

  return false;
}

export type TranscriptMessageLike = {
  role: string;
  text: string;
};

export function mergeTranscriptMessages<T extends TranscriptMessageLike>(messages: T[]): T[] {
  const merged: T[] = [];

  for (const message of messages) {
    const trimmed = message.text.trim();
    if (!trimmed) continue;

    const last = merged[merged.length - 1];
    if (last && last.role === message.role) {
      const text = mergeTranscriptChunk(last.text, trimmed);
      if (text === last.text) continue;
      merged[merged.length - 1] = { ...last, text };
      continue;
    }

    merged.push({ ...message, text: trimmed });
  }

  return merged;
}
