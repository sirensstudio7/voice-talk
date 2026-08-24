const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Must stay in sync with admin-app RESERVED_ADMIN_SLUGS + BUSINESS_SCOPED_ROOTS. */
const RESERVED_SLUGS = new Set([
  "login",
  "signup",
  "onboarding",
  "billing",
  "workspaces",
  "transactions",
  "settings",
  "api",
  "_next",
  "analytics",
  "menu",
  "appointments",
  "schedule",
  "orders",
  "payment",
  "knowledge",
  "presentations",
  "sessions",
  "ai-rules",
  "vision-settings",
  "conversations",
  "appearance",
  "add-ons",
]);

export type BusinessType =
  | "restaurant"
  | "cafe"
  | "retail"
  | "salon"
  | "clinic"
  | "other";

export type PrimaryUseCase = "orders" | "faqs" | "both" | "appointments";

export type OnboardingLanguage = "id" | "en";

/** Matches the Alex admin template — used for every new workspace. */
export const DEFAULT_ASSISTANT_NAME = "Alex";
export const DEFAULT_ASSISTANT_AVATAR_MODEL = "/models/thanh.glb";
export const DEFAULT_VOICE_GENDER = "male" as const;
export const DEFAULT_VOICE_PRESET = "natural" as const;
export const DEFAULT_ASSISTANT_TONE = "professional" as const;

export function defaultAiRulesValues(input: {
  businessId: string;
  businessName: string;
  language?: OnboardingLanguage;
  primaryUseCase?: PrimaryUseCase | string | null;
  businessType?: BusinessType | string | null;
}) {
  const language = input.language ?? "en";
  return {
    businessId: input.businessId,
    assistantName: DEFAULT_ASSISTANT_NAME,
    avatarModelPath: DEFAULT_ASSISTANT_AVATAR_MODEL,
    voiceGender: DEFAULT_VOICE_GENDER,
    voicePreset: DEFAULT_VOICE_PRESET,
    tone: DEFAULT_ASSISTANT_TONE,
    language,
    personality: defaultAssistantPersonality({
      businessName: input.businessName,
      language,
      primaryUseCase: input.primaryUseCase,
      businessType: input.businessType,
      assistantName: DEFAULT_ASSISTANT_NAME,
    }),
  };
}

export function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

export function isValidSlug(slug: string): boolean {
  return (
    slug.length > 0 &&
    slug.length <= 100 &&
    SLUG_RE.test(slug) &&
    !RESERVED_SLUGS.has(slug.toLowerCase())
  );
}

export function slugSuggestions(baseSlug: string): string[] {
  const compact = baseSlug.replace(/-/g, "");
  const candidates = [`${baseSlug}-co`, `${compact}123`, `${baseSlug}-id`];
  return [...new Set(candidates.filter((s) => isValidSlug(s)))].slice(0, 3);
}

function roleForUseCase(
  useCase: PrimaryUseCase,
  businessType: BusinessType | string | undefined,
): "cashier" | "faq" | "receptionist" {
  if (businessType === "salon" || useCase === "appointments") return "receptionist";
  if (useCase === "faqs") return "faq";
  return "cashier";
}

/** Default personality text used by onboarding and AI-rules fallbacks. */
export function defaultAssistantPersonality(options: {
  businessName: string;
  language?: OnboardingLanguage;
  primaryUseCase?: PrimaryUseCase | string | null;
  businessType?: BusinessType | string | null;
  assistantName?: string;
}): string {
  const language = options.language ?? "id";
  const useCase = (options.primaryUseCase ?? "both") as PrimaryUseCase;
  const type = (options.businessType ?? "other") as BusinessType;
  const name = options.businessName.trim() || "bisnis ini";
  const assistant = options.assistantName?.trim();
  const role = roleForUseCase(useCase, type);

  if (language === "en") {
    if (role === "faq") {
      return assistant
        ? `You are ${assistant}, a friendly AI customer service agent for ${name}. Answer questions clearly using the business knowledge base. Do not take food or coffee orders, push menu items, or invent products. Stay focused on this organization's services and policies.`
        : `You are a friendly AI customer service agent for ${name}. Answer questions clearly using the business knowledge base. Do not take food or coffee orders, push menu items, or invent products. Stay focused on this organization's services and policies.`;
    }
    if (role === "receptionist") {
      return assistant
        ? `You are ${assistant}, a friendly AI receptionist for ${name}. Help with services, schedules, and appointments. Be warm, concise, and helpful.`
        : `You are a friendly AI receptionist for ${name}. Help with services, schedules, and appointments. Be warm, concise, and helpful.`;
    }
    return assistant
      ? `You are ${assistant}, a friendly AI cashier for ${name}. Be warm, concise, and helpful when taking orders.`
      : `You are a friendly AI cashier for ${name}. Be warm, concise, and helpful when taking orders.`;
  }

  if (role === "faq") {
    return assistant
      ? `Kamu adalah ${assistant}, agen layanan pelanggan AI yang ramah di ${name}. Jawab pertanyaan dengan jelas menggunakan basis pengetahuan bisnis. Jangan menerima pesanan makanan/kopi, menawarkan menu, atau mengarang produk. Fokus pada layanan dan kebijakan organisasi ini.`
      : `Kamu adalah agen layanan pelanggan AI yang ramah di ${name}. Jawab pertanyaan dengan jelas menggunakan basis pengetahuan bisnis. Jangan menerima pesanan makanan/kopi, menawarkan menu, atau mengarang produk. Fokus pada layanan dan kebijakan organisasi ini.`;
  }
  if (role === "receptionist") {
    return assistant
      ? `Kamu adalah ${assistant}, resepsionis AI yang ramah di ${name}. Bantu layanan, jadwal, dan appointment. Bersikap hangat, ringkas, dan membantu.`
      : `Kamu adalah resepsionis AI yang ramah di ${name}. Bantu layanan, jadwal, dan appointment. Bersikap hangat, ringkas, dan membantu.`;
  }
  return assistant
    ? `Kamu adalah ${assistant}, kasir AI yang ramah di ${name}. Bersikap hangat, ringkas, dan membantu saat menerima pesanan.`
    : `Kamu adalah kasir AI yang ramah di ${name}. Bersikap hangat, ringkas, dan membantu saat menerima pesanan.`;
}

export function buildOnboardingAiRules(options: {
  businessName: string;
  businessType?: BusinessType;
  primaryUseCase?: PrimaryUseCase;
  language?: OnboardingLanguage;
}): {
  personality: string;
  language: OnboardingLanguage;
  toolInstructions: string;
} {
  const language = options.language ?? "id";
  const useCase = options.primaryUseCase ?? "both";
  const type = options.businessType ?? "other";
  const name = options.businessName;
  const role = roleForUseCase(useCase, type);

  const typeLabel: Record<BusinessType, { id: string; en: string }> = {
    restaurant: { id: "bisnis makanan dan minuman", en: "food & beverage business" },
    cafe: { id: "bisnis makanan dan minuman", en: "food & beverage business" },
    retail: { id: "toko retail", en: "retail store" },
    salon: { id: "salon", en: "salon" },
    clinic: { id: "fasilitas kesehatan", en: "healthcare facility" },
    other: { id: "bisnis", en: "business" },
  };

  const typeWord = typeLabel[type]?.[language] ?? typeLabel.other[language];

  if (language === "en") {
    const focus =
      role === "receptionist"
        ? useCase === "faqs"
          ? "Focus on answering customer questions clearly using the business knowledge base."
          : useCase === "appointments"
            ? "Help customers choose a treatment, check available times, and book appointments. Confirm name and phone before booking."
            : "Help customers book appointments and answer questions about services, hours, and policies."
        : role === "faq"
          ? "Focus on answering customer questions clearly using the business knowledge base. Never take food or coffee orders."
          : useCase === "orders"
            ? "Focus on taking customer orders accurately and confirming items before checkout."
            : "Help customers with questions and take orders when they are ready to buy.";

    const roleLine =
      role === "faq"
        ? `You are ${DEFAULT_ASSISTANT_NAME}, a friendly AI customer service agent for ${name}, a ${typeWord}. Speak in clear, natural English. Be warm, concise, and helpful. Do not invent a coffee shop or restaurant context.`
        : role === "receptionist"
          ? `You are ${DEFAULT_ASSISTANT_NAME}, a friendly AI receptionist for ${name}, a ${typeWord}. Speak in clear, natural English. Be warm, concise, and helpful.`
          : `You are ${DEFAULT_ASSISTANT_NAME}, a friendly AI cashier for ${name}, a ${typeWord}. Speak in clear, natural English. Be warm, concise, and helpful.`;

    return {
      language: "en",
      personality: roleLine,
      toolInstructions: focus,
    };
  }

  const focus =
    role === "receptionist"
      ? useCase === "faqs"
        ? "Fokus menjawab pertanyaan pelanggan dengan jelas menggunakan basis pengetahuan bisnis."
        : useCase === "appointments"
          ? "Bantu pelanggan memilih treatment, cek jadwal kosong, dan buat appointment. Konfirmasi nama dan nomor telepon sebelum booking."
          : "Bantu pelanggan membuat appointment dan jawab pertanyaan tentang layanan, jam buka, dan kebijakan salon."
      : role === "faq"
        ? "Fokus menjawab pertanyaan pelanggan dengan jelas menggunakan basis pengetahuan bisnis. Jangan menerima pesanan makanan atau kopi."
        : useCase === "orders"
          ? "Fokus pada menerima pesanan pelanggan dengan akurat dan mengonfirmasi item sebelum checkout."
          : "Bantu pelanggan dengan pertanyaan dan terima pesanan saat mereka siap membeli.";

  const roleLine =
    role === "faq"
      ? `Kamu adalah ${DEFAULT_ASSISTANT_NAME}, agen layanan pelanggan AI yang ramah di ${name}, sebuah ${typeWord}. Selalu berbicara dalam Bahasa Indonesia yang natural. Bersikap hangat, ringkas, dan membantu. Jangan mengarang konteks kafe, kopi, atau restoran.`
      : role === "receptionist"
        ? `Kamu adalah ${DEFAULT_ASSISTANT_NAME}, resepsionis AI yang ramah di ${name}, sebuah ${typeWord}. Selalu berbicara dalam Bahasa Indonesia yang natural. Bersikap hangat, ringkas, dan membantu.`
        : `Kamu adalah ${DEFAULT_ASSISTANT_NAME}, kasir AI yang ramah di ${name}, sebuah ${typeWord}. Selalu berbicara dalam Bahasa Indonesia yang natural. Bersikap hangat, ringkas, dan membantu.`;

  return {
    language: "id",
    personality: roleLine,
    toolInstructions: focus,
  };
}
