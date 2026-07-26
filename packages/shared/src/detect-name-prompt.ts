const NAME_PROMPT_PATTERNS = [
  /\b(what(?:'s| is) your name|your name(?: please)?|may i (?:have|get|know) your name|could i (?:have|get) your name|can i (?:have|get) your name)\b/i,
  /\b(what name|name for (?:the |your |this )?order|name on (?:the |your )?receipt|who am i speaking with)\b/i,
  /\b(nama (?:anda|kamu|bapak|ibu|nya|di|pada|untuk|pelanggan)|siapa nama(?:nya| anda| kamu)?|namanya siapa|boleh (?:tahu|sebutkan|minta) nama(?:nya)?|minta nama|sebutkan nama|nama untuk|nama di struk|nama pada struk|nama di nota|nama pesanan|atas nama)\b/i,
  /\b(mohon (?:sebutkan|beritahu) nama|untuk (?:struk|nota).*nama|bisa (?:tahu|sebutkan) nama|tolong sebutkan nama|tolong nama)\b/i,
];

/** Other checkout topics that must not appear in the same turn as a name ask. */
const OTHER_CHECKOUT_QUESTION_PATTERNS = [
  /\b(loyalty|member(?:ship)?|rewards?\s+card|stamp\s+card|kartu\s+(?:loyalitas|member|pelanggan))\b/i,
  /\b(anything\s+else|something\s+else|would\s+you\s+like\s+(?:to\s+)?(?:add|order|try)|want\s+(?:to\s+)?add)\b/i,
  /\b(ada\s+(?:yang\s+)?(?:lagi|lain)|mau\s+(?:tambah|pesan|order)|tawarkan|ingin\s+tambah|tambah\s+lagi)\b/i,
  /\b(payment\s+method|how\s+(?:will|would)\s+you\s+(?:like\s+to\s+)?pay|cash\s+or\s+card)\b/i,
  /\b(metode\s+pembayaran|bayar\s+(?:tunai|kartu|pakai)|tunai\s+atau\s+kartu)\b/i,
  /\b(phone\s+number|mobile\s+number|contact\s+number|nomor\s+(?:hp|telepon|wa|whatsapp))\b/i,
  /\b(email\s+address|alamat\s+email)\b/i,
  /\b(promo|diskon|voucher|kupon|coupon|discount)\b/i,
];

const OTHER_QUESTION_STARTERS = [
  /\b(apakah\s+(?:anda|kamu|bapak|ibu|ada|punya))\b/i,
  /\b(do\s+you|have\s+you|would\s+you|could\s+you|can\s+you|are\s+you|will\s+you|did\s+you)\b/i,
  /\b(punya\s+(?!nama)|mau\s+(?!nama)|ingin\s+(?!nama)|want\s+to|would\s+like\s+to)\b/i,
  /\b(sekalian|also\s+want|in\s+addition|selain\s+itu|before\s+pay(?:ing)?|sebelum\s+bayar)\b/i,
];

/** Context that may remain after stripping the name phrase — still a valid standalone name ask. */
const ALLOWED_NAME_CONTEXT_PATTERNS = [
  /\b(for\s+(?:the\s+)?(?:order|receipt)|on\s+(?:the\s+)?receipt)\b/i,
  /\b(untuk\s+(?:struk|nota|pesanan|order)|di\s+(?:struk|nota))\b/i,
  /\bplease\b/i,
  /\b(mohon|tolong)\b/i,
];

const PLEASANTRY_PATTERN =
  /\b(great|perfect|wonderful|sure|baik|sip|oke|ok|terima\s+kasih|thanks|thank\s+you|bagus|mantap|good|nice)\b/gi;

export function assistantAsksForCustomerName(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return NAME_PROMPT_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function stripNameAskPhrases(text: string): string {
  let remainder = text;
  for (const pattern of NAME_PROMPT_PATTERNS) {
    remainder = remainder.replace(new RegExp(pattern.source, pattern.flags), " ");
  }
  return remainder.replace(/\s+/g, " ").trim();
}

function hasMultipleQuestions(text: string): boolean {
  const questionMarks = (text.match(/\?/g) ?? []).length;
  if (questionMarks > 1) return true;

  if (
    /\b(?:and|dan|or|atau|also|juga|sekalian|serta)\b/i.test(text) &&
    assistantAsksForCustomerName(text) &&
    (OTHER_CHECKOUT_QUESTION_PATTERNS.some((pattern) => pattern.test(text)) ||
      OTHER_QUESTION_STARTERS.some((pattern) => pattern.test(text)))
  ) {
    return true;
  }

  return false;
}

function hasExtraQuestionBeyondNameAsk(text: string): boolean {
  let remainder = stripNameAskPhrases(text);
  if (!remainder) return false;

  remainder = remainder
    .replace(PLEASANTRY_PATTERN, " ")
    .replace(/\b(?:and|dan|juga|also|then|lalu|selanjutnya)\b/gi, " ")
    .replace(/[!.,:;?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (const pattern of ALLOWED_NAME_CONTEXT_PATTERNS) {
    remainder = remainder.replace(pattern, " ").replace(/\s+/g, " ").trim();
  }

  if (!remainder) return false;
  if (OTHER_QUESTION_STARTERS.some((pattern) => pattern.test(remainder))) return true;
  if (OTHER_CHECKOUT_QUESTION_PATTERNS.some((pattern) => pattern.test(remainder))) {
    return true;
  }

  return remainder.split(/\s+/).filter(Boolean).length >= 2;
}

/** True when the assistant asks for the name as the only question in that turn. */
export function isStandaloneCustomerNameAsk(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (!assistantAsksForCustomerName(trimmed)) return false;
  if (hasMultipleQuestions(trimmed)) return false;
  if (OTHER_CHECKOUT_QUESTION_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return false;
  }
  if (hasExtraQuestionBeyondNameAsk(trimmed)) return false;
  return true;
}

/** True when a name ask appears bundled with another question in the same turn. */
export function isCombinedCustomerNameAsk(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return assistantAsksForCustomerName(trimmed) && !isStandaloneCustomerNameAsk(trimmed);
}
