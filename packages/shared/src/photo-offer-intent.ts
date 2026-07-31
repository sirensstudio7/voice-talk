/** Positive / negative intent phrases for Smart Photo Moment voice offer. */

const POSITIVE =
  /\b(ya+|iya+|mau+|boleh+|yes+|yeah+|yep+|oke+|okay+|ok+|sure|silakan|boleh\s*dong)\b/i;

const NEGATIVE =
  /\b(tidak+|nggak+|nga+k+|gak+|no+|nope+|nanti+|jangan+|enggak+|ndak+)\b/i;

export type PhotoOfferIntent = "yes" | "no" | "unknown";

export function detectPhotoOfferIntent(text: string): PhotoOfferIntent {
  const cleaned = text.trim().toLowerCase();
  if (!cleaned) return "unknown";

  const hasNeg = NEGATIVE.test(cleaned);
  const hasPos = POSITIVE.test(cleaned);

  // Prefer explicit negatives when both appear ("ya tapi nanti" → no)
  if (hasNeg && !hasPos) return "no";
  if (hasPos && !hasNeg) return "yes";
  if (hasNeg && hasPos) return "no";
  return "unknown";
}
