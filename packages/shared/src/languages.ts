export const BASE_AI_LANGUAGES = ["id", "en"] as const;
export const PACK_AI_LANGUAGES = [
  "ru",
  "zh",
  "uz",
  "ja",
  "ko",
  "ar",
  "th",
  "vi",
  "ms",
  "tr",
] as const;
export const ALL_AI_LANGUAGES = [...BASE_AI_LANGUAGES, ...PACK_AI_LANGUAGES] as const;

export type BaseAiLanguage = (typeof BASE_AI_LANGUAGES)[number];
export type PackAiLanguage = (typeof PACK_AI_LANGUAGES)[number];
export type AiLanguage = (typeof ALL_AI_LANGUAGES)[number];

export type AiLanguageOption = {
  value: AiLanguage;
  label: string;
  nativeLabel: string;
  short: string;
  description: string;
  pack: boolean;
};

export const AI_LANGUAGE_OPTIONS: AiLanguageOption[] = [
  {
    value: "id",
    label: "Bahasa Indonesia",
    nativeLabel: "Bahasa Indonesia",
    short: "ID",
    description: "Your assistant speaks Indonesian with customers by default.",
    pack: false,
  },
  {
    value: "en",
    label: "English",
    nativeLabel: "English",
    short: "EN",
    description: "Your assistant speaks English with customers by default.",
    pack: false,
  },
  {
    value: "ru",
    label: "Russian",
    nativeLabel: "Русский",
    short: "RU",
    description: "Speak Russian with customers on the kiosk.",
    pack: true,
  },
  {
    value: "zh",
    label: "Chinese (Simplified)",
    nativeLabel: "简体中文",
    short: "ZH",
    description: "Speak Simplified Chinese with customers on the kiosk.",
    pack: true,
  },
  {
    value: "uz",
    label: "Uzbek",
    nativeLabel: "Oʻzbekcha",
    short: "UZ",
    description: "Speak Uzbek with customers on the kiosk.",
    pack: true,
  },
  {
    value: "ja",
    label: "Japanese",
    nativeLabel: "日本語",
    short: "JA",
    description: "Speak Japanese with customers on the kiosk.",
    pack: true,
  },
  {
    value: "ko",
    label: "Korean",
    nativeLabel: "한국어",
    short: "KO",
    description: "Speak Korean with customers on the kiosk.",
    pack: true,
  },
  {
    value: "ar",
    label: "Arabic",
    nativeLabel: "العربية",
    short: "AR",
    description: "Speak Arabic with customers on the kiosk.",
    pack: true,
  },
  {
    value: "th",
    label: "Thai",
    nativeLabel: "ไทย",
    short: "TH",
    description: "Speak Thai with customers on the kiosk.",
    pack: true,
  },
  {
    value: "vi",
    label: "Vietnamese",
    nativeLabel: "Tiếng Việt",
    short: "VI",
    description: "Speak Vietnamese with customers on the kiosk.",
    pack: true,
  },
  {
    value: "ms",
    label: "Malay",
    nativeLabel: "Bahasa Melayu",
    short: "MS",
    description: "Speak Malay with customers on the kiosk.",
    pack: true,
  },
  {
    value: "tr",
    label: "Turkish",
    nativeLabel: "Türkçe",
    short: "TR",
    description: "Speak Turkish with customers on the kiosk.",
    pack: true,
  },
];

const LANGUAGE_SET = new Set<string>(ALL_AI_LANGUAGES);
const PACK_SET = new Set<string>(PACK_AI_LANGUAGES);

export function isAiLanguage(value: string | null | undefined): value is AiLanguage {
  return Boolean(value && LANGUAGE_SET.has(value));
}

export function isPackLanguage(value: string | null | undefined): boolean {
  return Boolean(value && PACK_SET.has(value));
}

export function languageOption(value: AiLanguage): AiLanguageOption {
  return AI_LANGUAGE_OPTIONS.find((option) => option.value === value) ?? AI_LANGUAGE_OPTIONS[0]!;
}

export function availableAiLanguages(hasLanguagePack: boolean): AiLanguage[] {
  return hasLanguagePack ? [...ALL_AI_LANGUAGES] : [...BASE_AI_LANGUAGES];
}

export function availableLanguageOptions(hasLanguagePack: boolean): AiLanguageOption[] {
  return AI_LANGUAGE_OPTIONS.filter((option) => !option.pack || hasLanguagePack);
}

export function resolveAiLanguage(
  value: string | null | undefined,
  hasLanguagePack: boolean,
  fallback: AiLanguage = "id",
): AiLanguage {
  if (isAiLanguage(value) && (!isPackLanguage(value) || hasLanguagePack)) {
    return value;
  }
  return fallback;
}
