export function mergeTranscriptChunk(existing: string, incoming: string): string {
  if (!existing) return incoming;
  if (!incoming) return existing;
  if (incoming.startsWith(existing)) return incoming;
  if (existing.startsWith(incoming)) return existing;
  if (existing.endsWith(incoming)) return existing;

  const maxOverlap = Math.min(existing.length, incoming.length);
  for (let size = maxOverlap; size > 0; size -= 1) {
    if (existing.slice(-size) === incoming.slice(0, size)) {
      return existing + incoming.slice(size);
    }
  }

  const needsSpace =
    !/\s$/.test(existing) &&
    !/^\s/.test(incoming) &&
    !/^[.,!?;:'"')\]}>—-]/.test(incoming);

  return needsSpace ? `${existing} ${incoming}` : `${existing}${incoming}`;
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
