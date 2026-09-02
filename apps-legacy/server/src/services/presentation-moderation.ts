export type ModerationResult = {
  allowed: boolean;
  reasons: string[];
  categories: string[];
};

const PROFANITY = [
  "fuck",
  "shit",
  "bitch",
  "asshole",
  "kontol",
  "anjing",
  "bangsat",
];

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior)\s+instructions/i,
  /system\s*prompt/i,
  /jailbreak/i,
  /you\s+are\s+now\s+dan/i,
  /disregard\s+(your|all)\s+rules/i,
  /<\s*script/i,
];

const UNSAFE_PATTERNS = [
  /\b(how to make a bomb|kill yourself|child porn)\b/i,
];

export function moderateAudienceQuestion(question: string): ModerationResult {
  const text = question.trim();
  const reasons: string[] = [];
  const categories: string[] = [];

  if (!text) {
    return { allowed: false, reasons: ["empty"], categories: ["empty"] };
  }

  const lower = text.toLowerCase();
  for (const word of PROFANITY) {
    if (lower.includes(word)) {
      reasons.push("profanity");
      categories.push("profanity");
      break;
    }
  }

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      reasons.push("prompt_injection");
      categories.push("prompt_injection");
      break;
    }
  }

  for (const pattern of UNSAFE_PATTERNS) {
    if (pattern.test(text)) {
      reasons.push("unsafe");
      categories.push("unsafe");
      break;
    }
  }

  // Basic PII harvest attempt
  if (/\b(ssn|credit\s*card|password\s*is)\b/i.test(text) && /\d{4,}/.test(text)) {
    reasons.push("pii");
    categories.push("pii");
  }

  return {
    allowed: reasons.length === 0,
    reasons,
    categories,
  };
}
