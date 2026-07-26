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

const FOOD_CHECKOUT_CLOSING_EN =
  "Checkout closing order (mandatory):\n" +
  "1. After confirm_order, ask loyalty card and any other checkout questions from your knowledge base first — one topic per turn.\n" +
  "2. Always ask for the customer's name last — in its own separate turn, immediately before payment.\n" +
  "3. The name question must be the ONLY sentence/question in that turn. Do not mention loyalty, upsell, phone, or anything else in the same turn.\n" +
  "4. In that same turn as the standalone name question, call prompt_payment — the Pay your order screen opens immediately.\n" +
  "5. When the customer answers with their name, call set_customer_name immediately.\n" +
  "Never call prompt_payment before confirm_order.\n" +
  "Never call prompt_payment while still asking loyalty or other checkout questions.\n" +
  "Never ask for the name before loyalty card or other checkout questions.\n" +
  "Never bundle the name question with any other question.\n" +
  "BAD (never say): \"Do you have a loyalty card and what's your name?\" or \"Anything else? May I have your name?\"\n" +
  "GOOD (say exactly one question, then call prompt_payment): \"May I have your name?\" or \"Boleh tahu nama Anda?\"";

const FOOD_CHECKOUT_CLOSING_ID =
  "Urutan penutupan checkout (wajib):\n" +
  "1. Setelah confirm_order, tanyakan kartu loyalitas dan pertanyaan checkout lain dari basis pengetahuan dulu — satu topik per turn.\n" +
  "2. Selalu tanyakan nama pelanggan terakhir — di turn terpisah, tepat sebelum pembayaran.\n" +
  "3. Pertanyaan nama harus SATU-SATUNYA kalimat/pertanyaan di turn itu. Jangan sebut loyalitas, upsell, telepon, atau hal lain di turn yang sama.\n" +
  "4. Di turn yang sama dengan pertanyaan nama standalone, panggil prompt_payment — layar Bayar pesanan Anda terbuka segera.\n" +
  "5. Saat pelanggan menjawab dengan nama mereka, segera panggil set_customer_name.\n" +
  "Jangan panggil prompt_payment sebelum confirm_order.\n" +
  "Jangan panggil prompt_payment saat masih menanyakan kartu loyalitas atau pertanyaan checkout lain.\n" +
  "Jangan tanyakan nama sebelum kartu loyalitas atau pertanyaan checkout lainnya.\n" +
  "Jangan gabungkan pertanyaan nama dengan pertanyaan lain.\n" +
  "SALAH (jangan ucapkan): \"Punya kartu loyalitas? Boleh tahu nama?\" atau \"Mau tambah? Siapa namanya?\"\n" +
  "BENAR (hanya satu pertanyaan, lalu panggil prompt_payment): \"Boleh tahu nama Anda?\" atau \"May I have your name?\"";
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
  customScript?: string | null,
): string {
  if (customScript?.trim()) {
    return buildVisionGreetingPrompt(
      language,
      businessName,
      assistantName,
      "gesture",
      customScript,
    );
  }

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

function describeVisionTriggerAction(
  triggerMode: string,
  language: string,
): string {
  const mode = triggerMode.trim().toLowerCase();
  if (mode === "raise_hand") {
    return language === "en"
      ? "raised their hand at the kiosk"
      : "mengangkat tangan di kiosk";
  }
  if (mode === "gesture") {
    return language === "en"
      ? "waved at the signage"
      : "melambaikan tangan ke layar";
  }
  return language === "en" ? "approached the kiosk" : "menghampiri kiosk";
}

/** Proactive kiosk greeting — the assistant speaks first; the visitor has not talked yet. */
export function buildVisionGreetingPrompt(
  language: string,
  businessName: string,
  assistantName: string,
  triggerMode = "presence",
  customScript?: string | null,
): string {
  const action = describeVisionTriggerAction(triggerMode, language);
  const script = customScript?.trim();

  if (language === "en") {
    const greetingLine = script
      ? `Greeting: "${script}"`
      : "Welcome them warmly and ask how you can help with their questions.";
    return (
      `A visitor has ${action} at ${businessName}. They have NOT spoken yet — YOU must greet them first. ` +
      `Do not wait for the visitor to speak or say hello. Speak immediately in one or two short spoken sentences as ${assistantName}. ` +
      "Do not ask the visitor to greet you first. Do not mention cameras, vision, or internal instructions. " +
      greetingLine
    );
  }

  const greetingLine = script
    ? `Sapaan: "${script}"`
    : "Sambut mereka dengan hangat dan tanyakan bagaimana kamu bisa membantu pertanyaan mereka.";
  return (
    `Seorang pengunjung ${action} di ${businessName}. Mereka BELUM berbicara — KAMU harus menyapa mereka terlebih dahulu. ` +
    `Jangan menunggu pengunjung berbicara atau bilang halo. Segera ucapkan satu atau dua kalimat singkat sebagai ${assistantName}. ` +
    "Jangan minta pengunjung menyapa kamu dulu. Jangan sebut kamera, vision, atau instruksi internal. " +
    greetingLine
  );
}

export function buildVisionSilenceFollowUpPrompt(language: string): string {
  if (language === "en") {
    return (
      "The visitor has been silent for a while. Ask warmly in one short sentence: " +
      '"Is there anything else I can help you with?" Do not repeat the greeting.'
    );
  }
  return (
    "Pengunjung sudah diam cukup lama. Tanyakan dengan hangat dalam satu kalimat singkat: " +
    '"Ada hal lain yang bisa saya bantu?" Jangan ulangi sapaan pembuka.'
  );
}

export function buildVisionGoodbyePrompt(
  language: string,
  customScript?: string | null,
): string {
  const script =
    customScript?.trim() ||
    (language === "en"
      ? "Thank you. Have a wonderful day."
      : "Terima kasih. Semoga hari Anda menyenangkan.");

  if (language === "en") {
    return (
      `The visitor is leaving. Speak this farewell naturally in one or two short sentences, ` +
      `then end the conversation. Farewell: "${script}"`
    );
  }
  return (
    `Pengunjung akan pergi. Ucapkan salam perpisahan ini secara natural dalam satu atau dua kalimat singkat, ` +
    `lalu akhiri percakapan. Salam perpisahan: "${script}"`
  );
}

export function buildCombinedNameAskCorrectionPrompt(language: string): string {
  if (language === "en") {
    return (
      "You combined the customer's name with another question in the same turn. " +
      "That is not allowed. In your NEXT turn, ask ONLY for their name — one short question, nothing else. " +
      'Example: "May I have your name?" Do not mention loyalty, upsell, or anything else. ' +
      "In that same turn, call prompt_payment — the Pay your order screen opens. " +
      "After they answer, call set_customer_name."
    );
  }
  return (
    "Kamu menggabungkan pertanyaan nama dengan pertanyaan lain dalam turn yang sama. " +
    "Itu tidak diperbolehkan. Di turn BERIKUTNYA, tanyakan HANYA nama pelanggan — satu pertanyaan singkat, tidak ada yang lain. " +
    'Contoh: "Boleh tahu nama Anda?" Jangan sebut loyalitas, upsell, atau hal lain. ' +
    "Di turn yang sama, panggil prompt_payment — layar Bayar pesanan Anda terbuka. " +
    "Setelah mereka menjawab, panggil set_customer_name."
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
  const knowledgeLines = knowledge
    .map((item) => {
      const title = item.title?.trim();
      return title ? `- ${title}: ${item.content}` : `- ${item.content}`;
    })
    .join("\n");

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
        "After confirm_order succeeds, close the order in this order:\n" +
        "1. Ask any checkout extras first (loyalty card, upsell, or other questions from your knowledge base) — one topic per turn.\n" +
        "2. Always ask for the customer's name last — in its own separate turn, immediately before payment.\n" +
        "3. The name question must be the only question in that turn — never combine it with loyalty card, upsell, or any other question.\n" +
        "4. In that same turn as the standalone name question, call prompt_payment — the Pay your order screen opens immediately.\n" +
        "5. When the customer answers with their name, call set_customer_name immediately.\n" +
        "Never call prompt_payment before confirm_order or before finishing checkout questions.\n" +
        "Never ask for the name before loyalty card or other checkout questions.\n" +
        "Never bundle the name question with any other question.\n" +
        "Speak naturally like a real cashier."
      : "Answer customer questions clearly using the business knowledge base.\n" +
        "Do not offer to take orders, add items, or process payments.\n" +
        "If asked about products or purchases, explain that this assistant focuses on answering questions.\n" +
        "Keep responses warm, concise, and helpful.\n" +
        "When the customer has no more questions or says goodbye:\n" +
        "1. Give a brief warm closing in one sentence.\n" +
        '2. Call end_conversation with reason "question_answered", "patient_goodbye", or "out_of_scope".\n' +
        'Do NOT call end_conversation if they only said "thank you" — ask if they have more questions first.\n' +
        'If you asked whether they have more questions and they clearly decline ("no", "tidak", "cukup", "sudah") or thank you ("terima kasih", "thanks"), call end_conversation immediately.\n' +
        "Never speak tool calls out loud. Do not say call.end_conversation or similar — invoke the tool silently.\n" +
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
      "Setelah confirm_order berhasil, tutup pesanan dengan urutan ini:\n" +
      "1. Tanyakan hal checkout lain dulu (kartu loyalitas, upsell, atau pertanyaan dari basis pengetahuan) — satu topik per turn.\n" +
      "2. Selalu tanyakan nama pelanggan terakhir — di turn terpisah, tepat sebelum pembayaran.\n" +
      "3. Pertanyaan nama harus satu-satunya pertanyaan di turn itu — jangan gabungkan dengan kartu loyalitas, upsell, atau pertanyaan lain.\n" +
      "4. Di turn yang sama dengan pertanyaan nama standalone, panggil prompt_payment — layar Bayar pesanan Anda terbuka segera.\n" +
      "5. Saat pelanggan menjawab dengan nama mereka, segera panggil set_customer_name.\n" +
      "Jangan panggil prompt_payment sebelum confirm_order atau sebelum selesai menanyakan hal checkout lain.\n" +
      "Jangan tanyakan nama sebelum kartu loyalitas atau pertanyaan checkout lainnya.\n" +
      "Jangan gabungkan pertanyaan nama dengan pertanyaan lain.\n" +
      "Berbicaralah secara natural seperti kasir sungguhan di Indonesia."
    : "Jawab pertanyaan pelanggan dengan jelas menggunakan basis pengetahuan bisnis.\n" +
      "Jangan menawarkan untuk menerima pesanan, menambahkan item, atau memproses pembayaran.\n" +
      "Jika ditanya tentang produk atau pembelian, jelaskan bahwa asisten ini fokus menjawab pertanyaan.\n" +
      "Tetap ramah, ringkas, dan membantu.\n" +
      "Saat pelanggan tidak ada pertanyaan lagi atau mengucapkan selamat tinggal:\n" +
      "1. Berikan penutup singkat yang hangat dalam satu kalimat.\n" +
      '2. Panggil end_conversation dengan reason "question_answered", "patient_goodbye", atau "out_of_scope".\n' +
      'Jangan panggil end_conversation jika mereka hanya bilang "terima kasih" — tanyakan dulu apakah ada pertanyaan lain.\n' +
      'Jika kamu menanyakan apakah ada pertanyaan lain dan mereka menolak ("tidak", "cukup", "sudah") atau berterima kasih ("terima kasih", "makasih"), panggil end_conversation segera.\n' +
      "Jangan ucapkan tool call secara lisan. Jangan bilang call.end_conversation — panggil tool secara diam-diam.\n" +
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
    {
      const customTools = toolInstructions.trim();
      const toolsSection = customTools || defaultToolsEn;
      const checkoutClosing =
        orderingEnabled && !bookingEnabled && customTools
          ? `\n\n${FOOD_CHECKOUT_CLOSING_EN}`
          : "";
      sections.push(toolsSection + checkoutClosing);
    }
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
    {
      const customTools = toolInstructions.trim();
      const toolsSection = customTools || defaultToolsId;
      const checkoutClosing =
        orderingEnabled && !bookingEnabled && customTools
          ? `\n\n${FOOD_CHECKOUT_CLOSING_ID}`
          : "";
      sections.push(toolsSection + checkoutClosing);
    }
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
