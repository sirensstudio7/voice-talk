const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type BusinessType =
  | "restaurant"
  | "cafe"
  | "retail"
  | "salon"
  | "clinic"
  | "other";

export type PrimaryUseCase = "orders" | "faqs" | "both" | "appointments";

export type OnboardingLanguage = "id" | "en";

export function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

export function isValidSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= 100 && SLUG_RE.test(slug);
}

export function slugSuggestions(baseSlug: string): string[] {
  const compact = baseSlug.replace(/-/g, "");
  const candidates = [`${baseSlug}-co`, `${compact}123`, `${baseSlug}-id`];
  return [...new Set(candidates.filter((s) => isValidSlug(s)))].slice(0, 3);
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
  const isSalon = type === "salon";

  const typeLabel: Record<BusinessType, { id: string; en: string }> = {
    restaurant: { id: "bisnis makanan dan minuman", en: "food & beverage business" },
    cafe: { id: "bisnis makanan dan minuman", en: "food & beverage business" },
    retail: { id: "toko retail", en: "retail store" },
    salon: { id: "salon", en: "salon" },
    clinic: { id: "fasilitas kesehatan", en: "healthcare facility" },
    other: { id: "bisnis", en: "business" },
  };

  const typeWord = typeLabel[type][language];

  if (isSalon) {
    if (language === "en") {
      const focus =
        useCase === "appointments"
          ? "Help customers choose a treatment, check available times, and book appointments. Confirm name and phone before booking."
          : useCase === "faqs"
            ? "Focus on answering customer questions clearly using the business knowledge base."
            : "Help customers book appointments and answer questions about services, hours, and policies.";

      return {
        language: "en",
        personality: `You are a friendly AI receptionist for ${name}, a ${typeWord}. Speak in clear, natural English. Be warm, concise, and helpful.`,
        toolInstructions: focus,
      };
    }

    const focus =
      useCase === "appointments"
        ? "Bantu pelanggan memilih treatment, cek jadwal kosong, dan buat appointment. Konfirmasi nama dan nomor telepon sebelum booking."
        : useCase === "faqs"
          ? "Fokus menjawab pertanyaan pelanggan dengan jelas menggunakan basis pengetahuan bisnis."
          : "Bantu pelanggan membuat appointment dan jawab pertanyaan tentang layanan, jam buka, dan kebijakan salon.";

    return {
      language: "id",
      personality: `Kamu adalah resepsionis AI yang ramah di ${name}, sebuah ${typeWord}. Selalu berbicara dalam Bahasa Indonesia yang natural. Bersikap hangat, ringkas, dan membantu.`,
      toolInstructions: focus,
    };
  }

  if (language === "en") {
    const focus =
      useCase === "orders"
        ? "Focus on taking customer orders accurately and confirming items before checkout."
        : useCase === "faqs"
          ? "Focus on answering customer questions clearly using the business knowledge base."
          : "Help customers with questions and take orders when they are ready to buy.";

    return {
      language: "en",
      personality: `You are a friendly AI cashier for ${name}, a ${typeWord}. Speak in clear, natural English. Be warm, concise, and helpful.`,
      toolInstructions: focus,
    };
  }

  const focus =
    useCase === "orders"
      ? "Fokus pada menerima pesanan pelanggan dengan akurat dan mengonfirmasi item sebelum checkout."
      : useCase === "faqs"
        ? "Fokus menjawab pertanyaan pelanggan dengan jelas menggunakan basis pengetahuan bisnis."
        : "Bantu pelanggan dengan pertanyaan dan terima pesanan saat mereka siap membeli.";

  return {
    language: "id",
    personality: `Kamu adalah kasir AI yang ramah di ${name}, sebuah ${typeWord}. Selalu berbicara dalam Bahasa Indonesia yang natural. Bersikap hangat, ringkas, dan membantu.`,
    toolInstructions: focus,
  };
}
