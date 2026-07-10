function normalize(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[!?.,]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const CLOSING_QUESTION_PATTERNS: RegExp[] = [
  /anything else/i,
  /another question/i,
  /any (other|more) questions?/i,
  /can i help/i,
  /help you with anything/i,
  /is there anything/i,
  /anything (more|i can)/i,
  /ada yang (bisa|bisa saya)/i,
  /ada yang ditanyakan/i,
  /ada pertanyaan lain/i,
  /masih ada yang/i,
  /bisa saya bantu/i,
  /ada lagi yang/i,
  /apakah ada yang/i,
  /masih ada pertanyaan/i,
];

const DECLINE_PATTERNS: RegExp[] = [
  /^(no|nope|nah)(\s+(thanks?|thank you))?$/,
  /^(that'?s (all|it|enough)|i'?m good|nothing else|all good|that will be all|enough|done|goodbye|bye)$/,
  /^(not really|no more)( questions?)?$/,
  /^(tidak|enggak|nggak|gak|ga|ngga)(\s+(ada|perlu|terima kasih|makasih))?$/,
  /^(cukup|sudah( cukup)?|udah( cukup)?)(,?\s*(terima kasih|makasih|ya|kok|deh)?)?$/,
  /^(tidak ada( lagi)?|nggak ada|gak ada|ga ada)( pertanyaan)?( ya)?$/,
  /^(sudah|udah|selesai)(,?\s*(terima kasih|makasih|ya)?)?$/,
  /^(nggak perlu|gak perlu|ga perlu|tidak perlu)$/,
];

const MAX_DECLINE_LENGTH = 80;

const VALID_END_REASONS = [
  "question_answered",
  "patient_goodbye",
  "out_of_scope",
] as const;

const VERBALIZED_END_CONVERSATION =
  /call\.?end_conversation\s*[\({]?\s*reason\s*:\s*["']?([^"'}\n]*)["']?\}?/i;

export function parseVerbalizedEndConversation(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const match = trimmed.match(VERBALIZED_END_CONVERSATION);
  if (match) {
    return normalizeEndReason(match[1] ?? "");
  }

  if (/call\.?end_conversation/i.test(trimmed)) {
    return "question_answered";
  }

  return null;
}

export function stripVerbalizedToolCalls(text: string): string {
  return text
    .replace(/call\.?end_conversation\s*[\({]?[^}\n]*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeEndReason(raw: string): string {
  const lower = raw.trim().toLowerCase();
  if ((VALID_END_REASONS as readonly string[]).includes(lower)) {
    return lower;
  }
  return "question_answered";
}

export function isUserThankingToEnd(text: string): boolean {
  const normalized = normalize(text);
  return /^(terima kasih|makasih|thanks?|thank you)( banyak| ya)?$/.test(normalized);
}

export function isAssistantClosingOffer(text: string): boolean {
  const normalized = normalize(text);
  if (!normalized) return false;
  return CLOSING_QUESTION_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function isUserDecliningMoreHelp(text: string): boolean {
  const normalized = normalize(text);
  if (!normalized || normalized.length > MAX_DECLINE_LENGTH) return false;

  if (/^(terima kasih|thanks?|thank you|makasih)$/.test(normalized)) {
    return false;
  }

  return DECLINE_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function shouldEndConversationAfterDecline(
  assistantText: string,
  userText: string,
): boolean {
  if (!assistantText.trim() || !userText.trim()) return false;
  return (
    isAssistantClosingOffer(assistantText) && isUserDecliningMoreHelp(userText)
  );
}

export function shouldEndConversationAfterThanks(
  assistantText: string,
  userText: string,
): boolean {
  if (!assistantText.trim() || !userText.trim()) return false;
  return isAssistantClosingOffer(assistantText) && isUserThankingToEnd(userText);
}

export function shouldEndFaqConversation(
  assistantText: string,
  userText: string,
): string | null {
  if (shouldEndConversationAfterDecline(assistantText, userText)) {
    return "question_answered";
  }
  if (shouldEndConversationAfterThanks(assistantText, userText)) {
    return "question_answered";
  }
  return null;
}
