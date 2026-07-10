import type { AiRules, Business, KnowledgeEntry, Product } from "../db/schema.js";
import { getBusinessCapabilities } from "@voicetalk/shared";
import { effectivePrice } from "./pricing.js";

const LANGUAGE_PRESETS: Record<string, string> = {
  id: "Selalu gunakan Bahasa Indonesia saat berbicara dengan pelanggan. Gunakan bahasa yang natural, sopan, dan ramah seperti kasir di Indonesia. Jika pelanggan berbicara dalam bahasa lain, tetap balas dalam Bahasa Indonesia kecuali mereka meminta sebaliknya.",
  en: "Always speak English with customers. Use natural, polite, and friendly language like a real cashier. If the customer speaks another language, still reply in English unless they ask otherwise.",
};

const TONE_PRESETS: Record<string, Record<string, string>> = {
  id: {
    friendly:
      "Gaya bicara: Ramah dan hangat.\nSapa pelanggan dengan senyum dalam suara — gunakan sapaan yang akrab seperti \"Halo!\" atau \"Selamat datang!\".\nTunjukkan antusiasme saat membantu dan konfirmasi pesanan dengan nada positif.\nTetap ringkas dan jelas, jangan terlalu panjang.",
    professional:
      "Gaya bicara: Profesional dan sopan.\nGunakan bahasa formal dan terstruktur — hindari slang, singkatan, atau ekspresi terlalu santai.\nSapa pelanggan dengan \"Selamat datang\" atau \"Baik, Bapak/Ibu\".\nFokus pada efisiensi: jawab pertanyaan secara langsung, konfirmasi pesanan dengan jelas dan rapi.",
    casual:
      "Gaya bicara: Santai dan akrab.\nBerbicaralah seperti barista teman — nada ringan, natural, dan tidak kaku.\nBoleh gunakan ekspresi sehari-hari yang umum di Indonesia, asalkan tetap sopan.\nJaga respons tetap singkat dan conversational, seperti ngobrol di warung kopi.",
  },
  en: {
    friendly:
      "Speaking style: Warm and friendly.\nGreet customers with a smile in your voice — use welcoming phrases like \"Hi there!\" or \"Welcome!\".\nShow enthusiasm when helping and confirm orders with a positive tone.\nKeep responses concise and clear.",
    professional:
      "Speaking style: Professional and polite.\nUse formal, structured language — avoid slang, abbreviations, or overly casual expressions.\nGreet customers with \"Welcome\" or \"Good day\".\nFocus on efficiency: answer questions directly and confirm orders clearly.",
    casual:
      "Speaking style: Relaxed and approachable.\nTalk like a friendly barista — light, natural, and not stiff.\nEveryday expressions are fine as long as you stay polite.\nKeep responses short and conversational.",
  },
};

const DEFAULT_TONE = "friendly";
const DEFAULT_LANGUAGE = "id";
const DEFAULT_ASSISTANT_NAME = "Lorescale";

export type BusinessWithRelations = Business & {
  products: Product[];
  knowledgeEntries: KnowledgeEntry[];
  aiRules: AiRules | null;
};

export function getActiveProducts(business: BusinessWithRelations): Product[] {
  return [...business.products]
    .filter((p) => p.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

function formatProductLine(product: Product): string {
  const salePrice = effectivePrice(product.price, product.discountPercent);
  const priceLabel =
    product.discountPercent > 0
      ? `Rp ${salePrice.toLocaleString("id-ID")} (diskon ${product.discountPercent}%, harga normal Rp ${product.price.toLocaleString("id-ID")})`
      : `Rp ${product.price.toLocaleString("id-ID")}`;
  return `- ${product.name} (${priceLabel}, ${product.category}): ${product.description}`;
}

export function resolveLanguage(
  rules: AiRules | null | undefined,
  languageOverride?: string | null,
): string {
  if (languageOverride) {
    const language = languageOverride.trim().toLowerCase();
    if (language in LANGUAGE_PRESETS) return language;
  }
  let language = (rules?.language ?? DEFAULT_LANGUAGE).trim().toLowerCase();
  if (!(language in LANGUAGE_PRESETS)) language = DEFAULT_LANGUAGE;
  return language;
}

export function resolveAssistantName(rules: AiRules | null | undefined): string {
  const name = (rules?.assistantName ?? DEFAULT_ASSISTANT_NAME).trim();
  return name || DEFAULT_ASSISTANT_NAME;
}

export function buildTranscriptContext(
  transcript: Array<{ role?: string; text?: string }>,
  language: string,
): string {
  const lines: string[] = [];
  for (const message of transcript) {
    const text = String(message.text ?? "").trim();
    if (!text) continue;
    const label = message.role === "user" ? "Customer" : "Assistant";
    lines.push(`${label}: ${text}`);
  }
  if (!lines.length) return "";

  const history = lines.join("\n");
  if (language === "en") {
    return (
      "\n\nOngoing conversation (continue seamlessly in the selected language; " +
      "do not greet again or restart from the beginning):\n" +
      history
    );
  }
  return (
    "\n\nPercakapan berlangsung (lanjutkan dengan mulus dalam bahasa yang dipilih; " +
    "jangan sapa ulang atau mulai dari awal):\n" +
    history
  );
}

export function buildSessionGreetingPrompt(
  language: string,
  businessName: string,
  assistantName: string,
  orderingEnabled = true,
): string {
  if (language === "en") {
    if (orderingEnabled) {
      return (
        `The customer just tapped "Order Now" to start ordering at ${businessName}. ` +
        `Greet them warmly in one or two short spoken sentences. Introduce yourself as ${assistantName}, ` +
        "welcome them to the store, and ask how you can help with their order. " +
        "Keep it natural and concise — do not mention tools or internal instructions."
      );
    }

    return (
      `The customer just tapped "Start conversation" at ${businessName}. ` +
      `Greet them warmly in one or two short spoken sentences. Introduce yourself as ${assistantName}, ` +
      "welcome them, and ask how you can help with their questions. " +
      "Keep it natural and concise — do not mention tools or internal instructions."
    );
  }

  if (orderingEnabled) {
    return (
      `Pelanggan baru saja mengetuk "Order Now" untuk mulai memesan di ${businessName}. ` +
      `Sapa mereka dengan hangat dalam satu atau dua kalimat singkat. Perkenalkan diri sebagai ${assistantName}, ` +
      "sambut mereka di toko, dan tanyakan bagaimana kamu bisa membantu pesanan mereka. " +
      "Buat sapaan terdengar natural dan ringkas — jangan sebut tools atau instruksi internal."
    );
  }

  return (
    `Pelanggan baru saja mengetuk "Mulai percakapan" di ${businessName}. ` +
    `Sapa mereka dengan hangat dalam satu atau dua kalimat singkat. Perkenalkan diri sebagai ${assistantName}, ` +
    "sambut mereka, dan tanyakan bagaimana kamu bisa membantu pertanyaan mereka. " +
    "Buat sapaan terdengar natural dan ringkas — jangan sebut tools atau instruksi internal."
  );
}

export function buildSystemInstruction(
  business: BusinessWithRelations,
  languageOverride?: string | null,
): string {
  const productList = getActiveProducts(business);
  const knowledge = [...business.knowledgeEntries].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.category.localeCompare(b.category),
  );
  const rules = business.aiRules;
  const language = resolveLanguage(rules, languageOverride);
  const assistantName = resolveAssistantName(rules);
  const capabilities = getBusinessCapabilities(
    business.primaryUseCase,
    business.businessType,
  );
  const orderingEnabled = capabilities.ordering_enabled;
  const bookingEnabled = capabilities.booking_enabled;

  const defaultPersonality =
    language === "en"
      ? bookingEnabled
        ? `You are ${assistantName}, a friendly AI salon receptionist.`
        : orderingEnabled
          ? `You are ${assistantName}, a friendly AI cashier.`
          : `You are ${assistantName}, a friendly AI assistant.`
      : bookingEnabled
        ? `Kamu adalah ${assistantName}, resepsionis AI salon yang ramah.`
        : orderingEnabled
          ? `Kamu adalah ${assistantName}, kasir AI yang ramah.`
          : `Kamu adalah ${assistantName}, asisten AI yang ramah.`;

  const personality = rules?.personality ?? defaultPersonality;
  let tone = (rules?.tone ?? DEFAULT_TONE).trim().toLowerCase();
  const tonePresets = TONE_PRESETS[language]!;
  if (!(tone in tonePresets)) tone = DEFAULT_TONE;
  const behavioral = rules?.behavioralRules ?? "";
  const toolInstructions = rules?.toolInstructions ?? "";

  const productLines = productList.map(formatProductLine).join("\n");
  const knowledgeLines = knowledge.map((item) => `- ${item.content}`).join("\n");

  const defaultToolsEn = bookingEnabled
    ? "Use tools to list treatments, check availability, and book appointments.\n" +
      "Confirm treatment, date, time, customer name, and phone before calling book_appointment.\n" +
      "Speak naturally like a real salon receptionist."
    : orderingEnabled
      ? "Use tools to look up products, update the order, and confirm when the customer is ready.\n" +
        "Call add_to_order only after the customer clearly confirms an item (e.g. \"yes\", \"add it\", \"that's correct\"). " +
        "Do not call add_to_order while they are still browsing, comparing options, or only stating a preference without confirming.\n" +
        "When the customer adds items via the menu screen, those items are already in the basket — do not call add_to_order for them.\n" +
        "If the customer asks to remove one item, call remove_from_order.\n" +
        "If the customer asks to cancel the whole order, start over, or clear the basket, call cancel_order.\n" +
        "After confirm_order succeeds, always ask for the customer's name before payment.\n" +
        "When they answer, call set_customer_name so the name appears on the receipt.\n" +
        "Speak naturally like a real cashier."
      : "Answer customer questions clearly using the business knowledge base.\n" +
        "Do not offer to take orders, add items, or process payments.\n" +
        "If asked about products or purchases, explain that this assistant focuses on answering questions.\n" +
        "Keep responses warm, concise, and helpful.\n" +
        "When the customer has no more questions or says goodbye:\n" +
        "1. Give a brief warm closing in one sentence.\n" +
        '2. Call end_conversation with reason "question_answered", "patient_goodbye", or "out_of_scope".\n' +
        'Do NOT call end_conversation if they only said "thank you" — ask if they have more questions first.\n' +
        "Do NOT keep the conversation open after a clear goodbye.";

  const defaultToolsId = bookingEnabled
    ? "Gunakan tools untuk melihat treatment, cek ketersediaan jadwal, dan membuat appointment.\n" +
      "Konfirmasi treatment, tanggal, jam, nama, dan nomor telepon pelanggan sebelum memanggil book_appointment.\n" +
      "Berbicaralah secara natural seperti resepsionis salon sungguhan."
    : orderingEnabled
    ? "Gunakan tools untuk mencari produk, memperbarui pesanan, dan mengonfirmasi saat pelanggan siap.\n" +
      "Panggil add_to_order hanya setelah pelanggan jelas mengonfirmasi item (misalnya \"iya\", \"tambahkan\", \"betul\"). " +
      "Jangan panggil add_to_order saat mereka masih browsing, membandingkan pilihan, atau hanya menyebut preferensi tanpa konfirmasi.\n" +
      "Saat pelanggan menambahkan item lewat layar menu, item tersebut sudah ada di keranjang — jangan panggil add_to_order untuk item itu.\n" +
      "Jika pelanggan minta hapus satu item, panggil remove_from_order.\n" +
      "Jika pelanggan minta batalkan seluruh pesanan, mulai ulang, atau kosongkan keranjang, panggil cancel_order.\n" +
      "Setelah confirm_order berhasil, selalu tanyakan nama pelanggan sebelum pembayaran.\n" +
      "Saat mereka menjawab, panggil set_customer_name agar nama muncul di struk.\n" +
      "Berbicaralah secara natural seperti kasir sungguhan di Indonesia."
    : "Jawab pertanyaan pelanggan dengan jelas menggunakan basis pengetahuan bisnis.\n" +
      "Jangan menawarkan untuk menerima pesanan, menambahkan item, atau memproses pembayaran.\n" +
      "Jika ditanya tentang produk atau pembelian, jelaskan bahwa asisten ini fokus menjawab pertanyaan.\n" +
      "Tetap ramah, ringkas, dan membantu.\n" +
      "Saat pelanggan tidak ada pertanyaan lagi atau mengucapkan selamat tinggal:\n" +
      "1. Berikan penutup singkat yang hangat dalam satu kalimat.\n" +
      '2. Panggil end_conversation dengan reason "question_answered", "patient_goodbye", atau "out_of_scope".\n' +
      'Jangan panggil end_conversation jika mereka hanya bilang "terima kasih" — tanyakan dulu apakah ada pertanyaan lain.\n' +
      "Jangan biarkan percakapan terbuka setelah salam perpisahan yang jelas.";

  const sections: string[] = [];

  if (language === "en") {
    sections.push(
      `Your name is ${assistantName}. Use this name when introducing yourself.`,
      personality.trim(),
      tonePresets[tone]!,
      `Language:\n${LANGUAGE_PRESETS[language]}`,
      `Store: ${business.name} — ${business.tagline}`,
    );
    if (orderingEnabled || bookingEnabled) {
      sections.push(
        `${bookingEnabled ? "Treatments" : "Menu"}:\n${productLines || (bookingEnabled ? "- No treatments configured yet." : "- No menu items configured yet.")}`,
      );
    }
    sections.push(`Knowledge:\n${knowledgeLines || "- No knowledge entries configured yet."}`);
    if (behavioral.trim()) sections.push(`Behavior rules:\n${behavioral.trim()}`);
    sections.push(toolInstructions.trim() || defaultToolsEn);
  } else {
    sections.push(
      `Namamu adalah ${assistantName}. Gunakan nama ini saat memperkenalkan diri.`,
      personality.trim(),
      tonePresets[tone]!,
      `Bahasa:\n${LANGUAGE_PRESETS[language]}`,
      `Toko: ${business.name} — ${business.tagline}`,
    );
    if (orderingEnabled || bookingEnabled) {
      sections.push(
        `${bookingEnabled ? "Treatment" : "Menu"}:\n${productLines || (bookingEnabled ? "- Belum ada treatment yang dikonfigurasi." : "- Belum ada menu yang dikonfigurasi.")}`,
      );
    }
    sections.push(`Pengetahuan:\n${knowledgeLines || "- Belum ada entri pengetahuan yang dikonfigurasi."}`);
    if (behavioral.trim()) sections.push(`Aturan perilaku:\n${behavioral.trim()}`);
    sections.push(toolInstructions.trim() || defaultToolsId);
  }

  return sections.join("\n\n");
}

export const ALLOWED_IDLE_TIMEOUT_SECONDS = [0, 15, 30, 60, 90, 120] as const;
export const DEFAULT_IDLE_TIMEOUT_SECONDS = 30;

export function normalizeIdleTimeoutSeconds(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_IDLE_TIMEOUT_SECONDS;
  const rounded = Math.round(parsed);
  if ((ALLOWED_IDLE_TIMEOUT_SECONDS as readonly number[]).includes(rounded)) {
    return rounded;
  }
  return DEFAULT_IDLE_TIMEOUT_SECONDS;
}

export function resolveIdleTimeoutMs(
  aiRules: Pick<AiRules, "idleTimeoutSeconds"> | null | undefined,
): number | null {
  const seconds = aiRules?.idleTimeoutSeconds ?? DEFAULT_IDLE_TIMEOUT_SECONDS;
  if (seconds <= 0) return null;
  return seconds * 1000;
}
