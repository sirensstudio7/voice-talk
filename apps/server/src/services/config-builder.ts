import type { AiRules, Business, KnowledgeEntry, Product } from "../db/schema.js";
import { getBusinessCapabilities, getVoicePresetSpeakingStyle, withBookingAddon } from "@voicetalk/shared";
import { resolveSpokenVisionScript } from "./vision-settings.js";
import { effectivePrice } from "./pricing.js";

function languageLock(instruction: string, extra = "") {
  return extra ? `${instruction} ${extra}` : instruction;
}

const LANGUAGE_PRESETS_ORDERING: Record<string, string> = {
  id: "Selalu gunakan Bahasa Indonesia saat berbicara dengan pelanggan. Gunakan bahasa yang natural, sopan, dan ramah seperti kasir di Indonesia. Jika pelanggan berbicara dalam bahasa lain, tetap balas dalam Bahasa Indonesia kecuali mereka meminta sebaliknya.",
  en: "Always speak English with customers. Use natural, polite, and friendly language like a real cashier. If the customer speaks another language, still reply in English unless they ask otherwise.",
  ru: "Всегда говорите с клиентами по-русски. Используйте естественный, вежливый и дружелюбный язык, как кассир. Если клиент говорит на другом языке, всё равно отвечайте по-русски, пока он не попросит иначе.",
  zh: "与顾客交谈时始终使用简体中文。语气自然、礼貌、友好，像真正的收银员。如果顾客使用其他语言，仍用中文回复，除非对方要求换语言。",
  uz: "Mijozlar bilan doimo o‘zbek tilida gaplashing. Tabiiy, xushmuomala va do‘stona tilda, kassir kabi. Agar mijoz boshqa tilda gapirsa, ular so‘ramaguncha o‘zbekcha javob bering.",
  ja: "お客様には常に日本語で話してください。自然で丁寧、親しみやすいレジ係のように。お客様が他の言語を使っても、別の言語を頼まれない限り日本語で答えてください。",
  ko: "고객과 항상 한국어로 대화하세요. 자연스럽고 공손하며 친근한 캐셔처럼 말하세요. 고객이 다른 언어를 써도 바꾸라고 하기 전에는 한국어로 답하세요.",
  ar: "تحدث مع العملاء دائمًا بالعربية. استخدم لغة طبيعية ومهذبة وودودة مثل أمين الصندوق. إذا تحدث العميل بلغة أخرى فاستمر بالعربية ما لم يطلب غير ذلك.",
  th: "พูดกับลูกค้าเป็นภาษาไทยเสมอ ใช้น้ำเสียงเป็นธรรมชาติ สุภาพ และเป็นมิตรเหมือนพนักงานแคชเชียร์ หากลูกค้าพูดภาษาอื่น ให้ตอบเป็นภาษาไทยจนกว่าจะขอให้เปลี่ยน",
  vi: "Luôn nói tiếng Việt với khách. Dùng lời tự nhiên, lịch sự và thân thiện như thu ngân. Nếu khách nói ngôn ngữ khác, vẫn trả lời tiếng Việt trừ khi họ yêu cầu đổi.",
  ms: "Sentiasa bercakap dalam Bahasa Melayu dengan pelanggan. Guna bahasa semula jadi, sopan dan mesra seperti juruwang. Jika pelanggan bercakap bahasa lain, tetap jawab dalam Bahasa Melayu kecuali mereka minta sebaliknya.",
  tr: "Müşterilerle her zaman Türkçe konuş. Doğal, nazik ve samimi bir kasiyer gibi konuş. Müşteri başka dil konuşursa, istemedikçe Türkçe yanıtla.",
};

const FAQ_NO_MENU =
  "Do not steer the conversation toward coffee, food, or menu orders unless that is part of this business.";

const LANGUAGE_PRESETS_FAQ: Record<string, string> = {
  id: "Selalu gunakan Bahasa Indonesia saat berbicara dengan pelanggan. Gunakan bahasa yang natural, sopan, dan ramah seperti agen layanan pelanggan. Jika pelanggan berbicara dalam bahasa lain, tetap balas dalam Bahasa Indonesia kecuali mereka meminta sebaliknya. Jangan mengarahkan percakapan ke pesanan kopi, makanan, atau menu kecuali itu memang bagian dari layanan bisnis ini.",
  en: languageLock(
    "Always speak English with customers. Use natural, polite, and friendly language like a customer service agent. If the customer speaks another language, still reply in English unless they ask otherwise.",
    FAQ_NO_MENU,
  ),
  ru: languageLock(LANGUAGE_PRESETS_ORDERING.ru!, FAQ_NO_MENU),
  zh: languageLock(LANGUAGE_PRESETS_ORDERING.zh!, FAQ_NO_MENU),
  uz: languageLock(LANGUAGE_PRESETS_ORDERING.uz!, FAQ_NO_MENU),
  ja: languageLock(LANGUAGE_PRESETS_ORDERING.ja!, FAQ_NO_MENU),
  ko: languageLock(LANGUAGE_PRESETS_ORDERING.ko!, FAQ_NO_MENU),
  ar: languageLock(LANGUAGE_PRESETS_ORDERING.ar!, FAQ_NO_MENU),
  th: languageLock(LANGUAGE_PRESETS_ORDERING.th!, FAQ_NO_MENU),
  vi: languageLock(LANGUAGE_PRESETS_ORDERING.vi!, FAQ_NO_MENU),
  ms: languageLock(LANGUAGE_PRESETS_ORDERING.ms!, FAQ_NO_MENU),
  tr: languageLock(LANGUAGE_PRESETS_ORDERING.tr!, FAQ_NO_MENU),
};

const LANGUAGE_PRESETS_BOOKING: Record<string, string> = {
  id: "Selalu gunakan Bahasa Indonesia saat berbicara dengan pelanggan. Gunakan bahasa yang natural, sopan, dan ramah seperti resepsionis. Jika pelanggan berbicara dalam bahasa lain, tetap balas dalam Bahasa Indonesia kecuali mereka meminta sebaliknya.",
  en: "Always speak English with customers. Use natural, polite, and friendly language like a receptionist. If the customer speaks another language, still reply in English unless they ask otherwise.",
  ru: "Всегда говорите с клиентами по-русски. Используйте естественный, вежливый и дружелюбный язык, как администратор. Если клиент говорит на другом языке, всё равно отвечайте по-русски, пока он не попросит иначе.",
  zh: "与顾客交谈时始终使用简体中文。语气自然、礼貌、友好，像真正的前台。如果顾客使用其他语言，仍用中文回复，除非对方要求换语言。",
  uz: "Mijozlar bilan doimo o‘zbek tilida gaplashing. Tabiiy, xushmuomala va do‘stona tilda, qabulxona xodimi kabi. Agar mijoz boshqa tilda gapirsa, ular so‘ramaguncha o‘zbekcha javob bering.",
  ja: "お客様には常に日本語で話してください。自然で丁寧、親しみやすい受付係のように。お客様が他の言語を使っても、別の言語を頼まれない限り日本語で答えてください。",
  ko: "고객과 항상 한국어로 대화하세요. 자연스럽고 공손하며 친근한 리셉셔니스트처럼 말하세요. 고객이 다른 언어를 써도 바꾸라고 하기 전에는 한국어로 답하세요.",
  ar: "تحدث مع العملاء دائمًا بالعربية. استخدم لغة طبيعية ومهذبة وودودة مثل موظف الاستقبال. إذا تحدث العميل بلغة أخرى فاستمر بالعربية ما لم يطلب غير ذلك.",
  th: "พูดกับลูกค้าเป็นภาษาไทยเสมอ ใช้น้ำเสียงเป็นธรรมชาติ สุภาพ และเป็นมิตรเหมือนพนักงานต้อนรับ หากลูกค้าพูดภาษาอื่น ให้ตอบเป็นภาษาไทยจนกว่าจะขอให้เปลี่ยน",
  vi: "Luôn nói tiếng Việt với khách. Dùng lời tự nhiên, lịch sự và thân thiện như lễ tân. Nếu khách nói ngôn ngữ khác, vẫn trả lời tiếng Việt trừ khi họ yêu cầu đổi.",
  ms: "Sentiasa bercakap dalam Bahasa Melayu dengan pelanggan. Guna bahasa semula jadi, sopan dan mesra seperti resepsionis. Jika pelanggan bercakap bahasa lain, tetap jawab dalam Bahasa Melayu kecuali mereka minta sebaliknya.",
  tr: "Müşterilerle her zaman Türkçe konuş. Doğal, nazik ve samimi bir resepsiyonist gibi konuş. Müşteri başka dil konuşursa, istemedikçe Türkçe yanıtla.",
};

const TONE_PRESETS_ORDERING: Record<string, Record<string, string>> = {
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

const TONE_PRESETS_FAQ: Record<string, Record<string, string>> = {
  id: {
    friendly:
      "Gaya bicara: Ramah dan hangat.\nSapa pelanggan dengan senyum dalam suara — gunakan sapaan seperti \"Halo!\" atau \"Selamat datang!\".\nBantu menjawab pertanyaan dengan jelas. Jangan menawarkan pesanan kopi/makanan atau upsell menu.\nTetap ringkas dan jelas.",
    professional:
      "Gaya bicara: Profesional dan sopan.\nGunakan bahasa formal dan terstruktur.\nSapa pelanggan dengan \"Selamat datang\" atau \"Baik, Bapak/Ibu\".\nFokus menjawab pertanyaan layanan, kebijakan, dan informasi bisnis secara langsung.",
    casual:
      "Gaya bicara: Santai dan akrab.\nNada ringan, natural, dan tidak kaku — seperti agen CS yang ramah.\nBoleh gunakan ekspresi sehari-hari yang sopan.\nJaga respons singkat; jangan mengarahkan ke pesanan makanan atau kopi.",
  },
  en: {
    friendly:
      "Speaking style: Warm and friendly.\nGreet customers with \"Hi there!\" or \"Welcome!\".\nAnswer questions clearly. Do not offer coffee/food orders or menu upsells.\nKeep responses concise.",
    professional:
      "Speaking style: Professional and polite.\nUse formal, structured language.\nGreet customers with \"Welcome\" or \"Good day\".\nFocus on answering service, policy, and business questions directly.",
    casual:
      "Speaking style: Relaxed and approachable.\nTalk like a friendly support agent — light and natural.\nEveryday expressions are fine if polite.\nKeep responses short; do not steer toward food or coffee orders.",
  },
};

const TONE_PRESETS_BOOKING: Record<string, Record<string, string>> = {
  id: {
    friendly:
      "Gaya bicara: Ramah dan hangat.\nSapa pelanggan dengan \"Halo!\" atau \"Selamat datang!\".\nBantu memilih layanan dan jadwal dengan nada positif.\nTetap ringkas dan jelas.",
    professional:
      "Gaya bicara: Profesional dan sopan.\nGunakan bahasa formal dan terstruktur.\nSapa pelanggan dengan \"Selamat datang\" atau \"Baik, Bapak/Ibu\".\nFokus pada efisiensi booking dan informasi layanan.",
    casual:
      "Gaya bicara: Santai dan akrab.\nNada ringan dan natural seperti resepsionis yang ramah.\nJaga respons singkat dan conversational.",
  },
  en: {
    friendly:
      "Speaking style: Warm and friendly.\nGreet customers with \"Hi there!\" or \"Welcome!\".\nHelp with services and scheduling in a positive tone.\nKeep responses concise.",
    professional:
      "Speaking style: Professional and polite.\nUse formal, structured language.\nGreet customers with \"Welcome\" or \"Good day\".\nFocus on efficient booking and service information.",
    casual:
      "Speaking style: Relaxed and approachable.\nTalk like a friendly receptionist — light and natural.\nKeep responses short and conversational.",
  },
};

const DEFAULT_TONE = "friendly";
const DEFAULT_LANGUAGE = "id";

const ORDER_PRICE_RECALL_EN =
  "Order read-back (mandatory):\n" +
  "After every add (voice add_to_order or menu tap), speak the item name, its price, and the running total. " +
  "Use the tool result `say` field when present. Never confirm an add with only the item name.\n" +
  'Example: "Added Latte, Rp 45.000. Total so far Rp 45.000. Anything else?"\n' +
  "When reading the full basket before checkout, list every item with its price, then the total.";

const ORDER_PRICE_RECALL_ID =
  "Baca ulang pesanan (wajib):\n" +
  "Setelah setiap penambahan (add_to_order atau tap menu), sebut nama item, harganya, dan total sementara. " +
  "Pakai field `say` dari hasil tool jika ada. Jangan konfirmasi hanya dengan nama item.\n" +
  'Contoh: "Latte sudah masuk, Rp 45.000. Total sementara Rp 45.000. Mau tambah yang lain?"\n' +
  "Saat membacakan keranjang sebelum checkout, sebut setiap item beserta harga, lalu total.";

/** Kept for resolveLanguage validation of known language codes. */
const LANGUAGE_PRESETS = LANGUAGE_PRESETS_ORDERING;

const FOOD_CHECKOUT_CLOSING_EN =
  "Checkout closing order (mandatory — overrides any earlier checkout order):\n" +
  "0. When the customer says the basket is correct or they are ready (e.g. \"that's right\", \"yes\", \"ok\", \"sudah benar\"), call confirm_order IMMEDIATELY. Never ask them to confirm the order again after that.\n" +
  "1. After confirm_order, ask loyalty card and any other checkout questions from your knowledge base first — one topic per turn. Skip questions already answered.\n" +
  "2. Always ask for the customer's name last — in its own separate turn, immediately before payment.\n" +
  "3. The name question must be the ONLY sentence/question in that turn. Do not mention loyalty, upsell, phone, or anything else in the same turn.\n" +
  "4. In that same turn as the standalone name question, call prompt_payment to prepare checkout.\n" +
  "5. When the customer answers with their name, call set_customer_name immediately — the Pay your order screen opens then.\n" +
  "Never call prompt_payment before confirm_order.\n" +
  "Never call prompt_payment while still asking loyalty or other checkout questions.\n" +
  "Never ask for the name before loyalty card or other checkout questions.\n" +
  "Never bundle the name question with any other question.\n" +
  "Never repeat a checkout question the customer already answered.\n" +
  "BAD (never say): \"Do you have a loyalty card and what's your name?\" or \"Anything else? May I have your name?\"\n" +
  "GOOD (say exactly one question, then call prompt_payment): \"May I have your name?\" or \"Boleh tahu nama Anda?\"";

const FOOD_CHECKOUT_CLOSING_ID =
  "Urutan penutupan checkout (wajib — mengoverride urutan checkout sebelumnya):\n" +
  "0. Saat pelanggan bilang pesanan sudah benar atau siap (misalnya \"sudah benar\", \"iya\", \"oke\"), segera panggil confirm_order. Jangan minta konfirmasi pesanan lagi setelah itu.\n" +
  "1. Setelah confirm_order, tanyakan kartu loyalitas dan pertanyaan checkout lain dari basis pengetahuan dulu — satu topik per turn. Lewati pertanyaan yang sudah dijawab.\n" +
  "2. Selalu tanyakan nama pelanggan terakhir — di turn terpisah, tepat sebelum pembayaran.\n" +
  "3. Pertanyaan nama harus SATU-SATUNYA kalimat/pertanyaan di turn itu. Jangan sebut loyalitas, upsell, telepon, atau hal lain di turn yang sama.\n" +
  "4. Di turn yang sama dengan pertanyaan nama standalone, panggil prompt_payment untuk menyiapkan checkout.\n" +
  "5. Saat pelanggan menjawab dengan nama mereka, segera panggil set_customer_name — layar Bayar pesanan Anda terbuka saat itu.\n" +
  "Jangan panggil prompt_payment sebelum confirm_order.\n" +
  "Jangan panggil prompt_payment saat masih menanyakan kartu loyalitas atau pertanyaan checkout lain.\n" +
  "Jangan tanyakan nama sebelum kartu loyalitas atau pertanyaan checkout lainnya.\n" +
  "Jangan gabungkan pertanyaan nama dengan pertanyaan lain.\n" +
  "Jangan ulangi pertanyaan checkout yang sudah dijawab pelanggan.\n" +
  "SALAH (jangan ucapkan): \"Punya kartu loyalitas? Boleh tahu nama?\" atau \"Mau tambah? Siapa namanya?\"\n" +
  "BENAR (hanya satu pertanyaan, lalu panggil prompt_payment): \"Boleh tahu nama Anda?\" atau \"May I have your name?\"";

function buildFoodCheckoutClosingWithPhoto(language: string, voicePrompt: string): string {
  const prompt =
    voicePrompt.trim() ||
    (language === "en"
      ? "Would you like a souvenir photo after payment?"
      : "Mau foto untuk kenang-kenangan setelah bayar nanti?");
  const safePrompt = prompt.replace(/"/g, '\\"');

  if (language === "en") {
    return (
      "Checkout closing order (mandatory — overrides any earlier checkout order):\n" +
      "0. When the customer says the basket is correct or they are ready (e.g. \"that's right\", \"yes\", \"ok\", \"sudah benar\"), call confirm_order IMMEDIATELY in that turn. Do not only speak confirmation. Never ask them to confirm the order again after confirm_order succeeded.\n" +
      "1. After confirm_order, ask loyalty card and any other checkout questions from your knowledge base first — one topic per turn. Skip any question they already answered.\n" +
      "2. Then ask about a souvenir photo in its own separate turn — BEFORE the name question. " +
      `Say naturally (same meaning): "${safePrompt}". ` +
      "Wait for a short yes/no, then call set_photo_souvenir_consent with consent \"yes\" or \"no\". Ask this photo question only once. If they already answered, call set_photo_souvenir_consent with that answer and do not ask again.\n" +
      "3. Always ask for the customer's name last — in its own separate turn, immediately before payment. Never ask for the name before the photo question.\n" +
      "4. The name question must be the ONLY sentence/question in that turn. Do not mention loyalty, photo, upsell, phone, or anything else in the same turn.\n" +
      "5. In that same turn as the standalone name question, call prompt_payment to prepare checkout.\n" +
      "6. When the customer answers with their name, call set_customer_name immediately — the Pay your order screen opens then.\n" +
      "Never call prompt_payment before confirm_order or before set_photo_souvenir_consent.\n" +
      "Never combine the photo question with the name question.\n" +
      "Never repeat a checkout question the customer already answered.\n" +
      "Never say \"let me confirm the order again\" after they already confirmed.\n" +
      "BAD: asking order confirm → loyalty → photo → order confirm again → photo again.\n" +
      'GOOD: confirm_order tool → loyalty once → photo once → "May I have your name?" + prompt_payment → set_customer_name.'
    );
  }

  return (
    "Urutan penutupan checkout (wajib — mengoverride urutan checkout sebelumnya):\n" +
    "0. Saat pelanggan bilang pesanan sudah benar atau siap bayar (misalnya \"sudah benar\", \"iya\", \"oke\", \"enggak itu aja\" lalu setuju ringkasan), segera panggil confirm_order di turn itu. Jangan hanya mengucapkan konfirmasi. Jangan minta konfirmasi pesanan lagi setelah confirm_order berhasil.\n" +
    "1. Setelah confirm_order, tanyakan kartu loyalitas dan pertanyaan checkout lain dari basis pengetahuan dulu — satu topik per turn. Lewati pertanyaan yang sudah dijawab.\n" +
    "2. Lalu tanyakan foto kenang-kenangan di turn terpisah — SEBELUM pertanyaan nama. " +
    `Ucapkan secara natural (makna sama): "${safePrompt}". ` +
    "Tunggu jawaban singkat ya/tidak, lalu panggil set_photo_souvenir_consent dengan consent \"yes\" atau \"no\". Tanyakan foto hanya sekali. Jika mereka sudah menjawab, panggil set_photo_souvenir_consent dengan jawaban itu tanpa bertanya lagi.\n" +
    "3. Selalu tanyakan nama pelanggan terakhir — di turn terpisah, tepat sebelum pembayaran. Jangan tanyakan nama sebelum pertanyaan foto.\n" +
    "4. Pertanyaan nama harus SATU-SATUNYA kalimat/pertanyaan di turn itu. Jangan sebut loyalitas, foto, upsell, telepon, atau hal lain di turn yang sama.\n" +
    "5. Di turn yang sama dengan pertanyaan nama standalone, panggil prompt_payment untuk menyiapkan checkout.\n" +
    "6. Saat pelanggan menjawab dengan nama mereka, segera panggil set_customer_name — layar Bayar pesanan Anda terbuka saat itu.\n" +
    "Jangan panggil prompt_payment sebelum confirm_order atau sebelum set_photo_souvenir_consent.\n" +
    "Jangan gabungkan pertanyaan foto dengan pertanyaan nama.\n" +
    "Jangan ulangi pertanyaan checkout yang sudah dijawab pelanggan.\n" +
    "Jangan bilang \"mohon konfirmasi pesanannya dulu\" setelah mereka sudah mengonfirmasi.\n" +
    "SALAH: konfirmasi pesanan → loyalitas → foto → konfirmasi pesanan lagi → foto lagi.\n" +
    'BENAR: tool confirm_order → loyalitas sekali → foto sekali → "Boleh tahu nama Anda?" + prompt_payment → set_customer_name.'
  );
}

/** @deprecated Prefer buildSystemInstruction options.photoMomentEnabled — kept for callers. */
export function buildPhotoSouvenirCheckoutAddon(
  language: string,
  voicePrompt: string,
): string {
  return `\n\n${buildFoodCheckoutClosingWithPhoto(language, voicePrompt)}`;
}

export type SystemInstructionOptions = {
  photoMomentEnabled?: boolean;
  photoVoicePrompt?: string;
  bookingAddonActive?: boolean;
  bookingStaff?: Array<{ id: string; name: string; specialty: string }>;
  bookingServices?: Array<{
    id: string;
    name: string;
    duration_min: number;
    price: number;
    description: string;
  }>;
};

function resolveFoodCheckoutClosing(
  language: string,
  options?: SystemInstructionOptions,
): string {
  if (options?.photoMomentEnabled) {
    return buildFoodCheckoutClosingWithPhoto(language, options.photoVoicePrompt ?? "");
  }
  return language === "en" ? FOOD_CHECKOUT_CLOSING_EN : FOOD_CHECKOUT_CLOSING_ID;
}
const DEFAULT_ASSISTANT_NAME = "Alex";

export type BusinessWithRelations = Business & {
  products: Product[];
  knowledgeEntries: KnowledgeEntry[];
  aiRules: AiRules | null;
};

export function getActiveProducts(business: BusinessWithRelations): Product[] {
  return [...business.products]
    .filter((p) => p.isActive && !p.liveOnly)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export function getSellableProducts(business: BusinessWithRelations): Product[] {
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

function looksLikeOrderingOrCoffeePersonality(text: string): boolean {
  const p = text.toLowerCase();
  return (
    p.includes("kasir ai") ||
    p.includes("ai cashier") ||
    p.includes("toko kopi") ||
    p.includes("barista") ||
    p.includes("warung kopi") ||
    p.includes("coffee shop") ||
    p.includes("sunrise coffee")
  );
}

function looksLikeOrderingToolInstructions(text: string): boolean {
  return /add_to_order|confirm_order|prompt_payment|remove_from_order/.test(text);
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
  const script = resolveSpokenVisionScript(customScript, language, "greeting");

  if (language === "en") {
    return (
      `A visitor has ${action} at ${businessName}. They have NOT spoken yet — YOU must greet them first. ` +
      `Speak ONLY in English. Do not wait for the visitor to speak or say hello. ` +
      `Speak this greeting out loud now, in one or two short spoken sentences, as ${assistantName}. ` +
      "Do not ask the visitor to greet you first. Do not mention cameras, vision, or internal instructions. " +
      `Say: "${script}"`
    );
  }

  return (
    `Seorang pengunjung ${action} di ${businessName}. Mereka BELUM berbicara — KAMU harus menyapa mereka terlebih dahulu. ` +
    `WAJIB berbicara dalam Bahasa Indonesia saja. Jangan menyapa dalam bahasa Inggris. ` +
    `Jangan menunggu pengunjung berbicara atau bilang halo. Ucapkan sapaan ini sekarang, ` +
    `satu atau dua kalimat singkat, sebagai ${assistantName}. ` +
    "Jangan minta pengunjung menyapa kamu dulu. Jangan sebut kamera, vision, atau instruksi internal. " +
    `Ucapkan: "${script}"`
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
  const script = resolveSpokenVisionScript(customScript, language, "goodbye");

  if (language === "en") {
    return (
      `The visitor is leaving. Speak ONLY in English. Speak this farewell out loud now, ` +
      `in one or two short sentences, then end the conversation. Say: "${script}"`
    );
  }
  return (
    `Pengunjung akan pergi. WAJIB berbicara dalam Bahasa Indonesia saja. Jangan pakai bahasa Inggris. ` +
    `Ucapkan salam perpisahan ini sekarang, satu atau dua kalimat singkat, lalu akhiri percakapan. ` +
    `Ucapkan: "${script}"`
  );
}

export function buildCombinedNameAskCorrectionPrompt(
  language: string,
  options?: {
    photoMomentEnabled?: boolean;
    photoConsentRecorded?: boolean;
    voicePrompt?: string;
  },
): string {
  const photoPending =
    Boolean(options?.photoMomentEnabled) && !options?.photoConsentRecorded;

  if (photoPending) {
    const prompt =
      options?.voicePrompt?.trim() ||
      (language === "en"
        ? "Would you like a souvenir photo after payment?"
        : "Mau foto untuk kenang-kenangan setelah bayar nanti?");
    const safePrompt = prompt.replace(/"/g, '\\"');
    if (language === "en") {
      return (
        "You combined the customer's name with another question (possibly the souvenir photo) in the same turn. " +
        "That is not allowed. Smart Photo Moment consent is not recorded yet. " +
        "In your NEXT turn, ask ONLY about the souvenir photo — one short yes/no question, nothing else. " +
        `Say naturally: "${safePrompt}". ` +
        "After they answer, call set_photo_souvenir_consent. " +
        "Do NOT ask for their name in that turn. Ask for the name alone only after photo consent is saved."
      );
    }
    return (
      "Kamu menggabungkan pertanyaan nama dengan pertanyaan lain (mungkin foto kenang-kenangan) dalam turn yang sama. " +
      "Itu tidak diperbolehkan. Consent Smart Photo Moment belum tercatat. " +
      "Di turn BERIKUTNYA, tanyakan HANYA tentang foto kenang-kenangan — satu pertanyaan ya/tidak singkat, tidak ada yang lain. " +
      `Ucapkan secara natural: "${safePrompt}". ` +
      "Setelah mereka menjawab, panggil set_photo_souvenir_consent. " +
      "JANGAN tanyakan nama di turn itu. Tanyakan nama saja setelah consent foto tersimpan."
    );
  }

  if (language === "en") {
    return (
      "You combined the customer's name with another question in the same turn. " +
      "That is not allowed. In your NEXT turn, ask ONLY for their name — one short question, nothing else. " +
      'Example: "May I have your name?" Do not mention loyalty, photo, upsell, or anything else. ' +
      "In that same turn, call prompt_payment to prepare checkout. " +
      "After they answer, call set_customer_name — the Pay your order screen opens then. " +
      "Do not repeat questions they already answered."
    );
  }
  return (
    "Kamu menggabungkan pertanyaan nama dengan pertanyaan lain dalam turn yang sama. " +
    "Itu tidak diperbolehkan. Di turn BERIKUTNYA, tanyakan HANYA nama pelanggan — satu pertanyaan singkat, tidak ada yang lain. " +
    'Contoh: "Boleh tahu nama Anda?" Jangan sebut loyalitas, foto, upsell, atau hal lain. ' +
    "Di turn yang sama, panggil prompt_payment untuk menyiapkan checkout. " +
    "Setelah mereka menjawab, panggil set_customer_name — layar Bayar pesanan Anda terbuka saat itu. " +
    "Jangan ulangi pertanyaan yang sudah dijawab."
  );
}

export function buildSystemInstruction(
  business: BusinessWithRelations,
  languageOverride?: string | null,
  options?: SystemInstructionOptions,
): string {
  const productList = getActiveProducts(business);
  const knowledge = [...business.knowledgeEntries].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.category.localeCompare(b.category),
  );
  const rules = business.aiRules;
  const language = resolveLanguage(rules, languageOverride);
  const assistantName = resolveAssistantName(rules);
  const capabilities = withBookingAddon(
    getBusinessCapabilities(
      business.primaryUseCase,
      business.businessType,
    ),
    Boolean(options?.bookingAddonActive),
  );
  const orderingEnabled = capabilities.ordering_enabled;
  const bookingEnabled = capabilities.booking_enabled;
  const faqOnly = !orderingEnabled && !bookingEnabled;

  const languagePresets = bookingEnabled
    ? LANGUAGE_PRESETS_BOOKING
    : faqOnly
      ? LANGUAGE_PRESETS_FAQ
      : LANGUAGE_PRESETS_ORDERING;
  const toneTable = bookingEnabled
    ? TONE_PRESETS_BOOKING
    : faqOnly
      ? TONE_PRESETS_FAQ
      : TONE_PRESETS_ORDERING;
  const tonePresets = toneTable[language] ?? toneTable.en!;

  const defaultPersonality =
    language === "en"
      ? bookingEnabled
        ? `You are ${assistantName}, a friendly AI receptionist who books appointments.`
        : orderingEnabled
          ? `You are ${assistantName}, a friendly AI cashier.`
          : `You are ${assistantName}, a friendly AI customer service agent for ${business.name}. Do not invent a coffee shop or restaurant context.`
      : bookingEnabled
        ? `Kamu adalah ${assistantName}, resepsionis AI yang ramah untuk booking janji.`
        : orderingEnabled
          ? `Kamu adalah ${assistantName}, kasir AI yang ramah.`
          : `Kamu adalah ${assistantName}, agen layanan pelanggan AI yang ramah di ${business.name}. Jangan mengarang konteks kafe, kopi, atau restoran.`;

  const personalityRaw = (rules?.personality ?? "").trim();
  const personality =
    !personalityRaw
      ? defaultPersonality
      : (faqOnly || bookingEnabled) && looksLikeOrderingOrCoffeePersonality(personalityRaw)
        ? defaultPersonality
        : personalityRaw;
  let tone = (rules?.tone ?? DEFAULT_TONE).trim().toLowerCase();
  if (!(tone in tonePresets)) tone = DEFAULT_TONE;
  const behavioral = rules?.behavioralRules ?? "";
  const toolInstructionsRaw = (rules?.toolInstructions ?? "").trim();
  const toolInstructions =
    (faqOnly || bookingEnabled) &&
    toolInstructionsRaw &&
    looksLikeOrderingToolInstructions(toolInstructionsRaw)
      ? ""
      : toolInstructionsRaw;
  const voiceSpeakingStyle = getVoicePresetSpeakingStyle(rules?.voicePreset);

  const productLines = productList.map(formatProductLine).join("\n");
  const staffLines = (options?.bookingStaff ?? [])
    .map((person) =>
      `- ${person.name}${person.specialty ? ` (${person.specialty})` : ""} [id ${person.id}]`,
    )
    .join("\n");
  const bookingServiceLines = (options?.bookingServices ?? [])
    .map(
      (service) =>
        `- ${service.name} (${service.duration_min} min, Rp ${service.price.toLocaleString("id-ID")}): ${service.description || "—"} [id ${service.id}]`,
    )
    .join("\n");
  const treatmentLines = bookingServiceLines || productLines;
  const knowledgeLines = knowledge
    .map((item) => {
      const title = item.title?.trim();
      return title ? `- ${title}: ${item.content}` : `- ${item.content}`;
    })
    .join("\n");

  const defaultToolsEn = bookingEnabled
    ? "Use tools to list doctors (if available), list services, check availability, and book appointments.\n" +
      "Times are Asia/Jakarta. After check_availability, pass starts_at exactly as returned in slots (keep the +07:00 offset).\n" +
      "If list_staff returns people, confirm which doctor, then the service, date, time, customer name, and phone before calling book_appointment.\n" +
      "Never say the appointment is booked until book_appointment returns success. If the tool returns an error, tell the customer and try again.\n" +
      "Do not ask about loyalty cards, payment, or orders.\n" +
      "Speak naturally like a real receptionist."
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
        "4. In that same turn as the standalone name question, call prompt_payment to prepare checkout.\n" +
        "5. When the customer answers with their name, call set_customer_name immediately — the Pay your order screen opens then.\n" +
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
    ? "Gunakan tools untuk melihat dokter (jika ada), layanan, cek ketersediaan jadwal, dan membuat appointment.\n" +
      "Waktu memakai zona Asia/Jakarta. Setelah check_availability, kirim starts_at persis seperti string slot yang dikembalikan (tetap pakai offset +07:00).\n" +
      "Jika list_staff mengembalikan orang, konfirmasi dokter, lalu layanan, tanggal, jam, nama, dan nomor telepon sebelum memanggil book_appointment.\n" +
      "Jangan bilang janji sudah terbooking sebelum book_appointment mengembalikan success. Jika tool error, sampaikan ke pelanggan dan coba lagi.\n" +
      "Jangan tanya kartu loyalitas, pembayaran, atau pesanan makanan.\n" +
      "Berbicaralah secara natural seperti resepsionis sungguhan."
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
      "4. Di turn yang sama dengan pertanyaan nama standalone, panggil prompt_payment untuk menyiapkan checkout.\n" +
      "5. Saat pelanggan menjawab dengan nama mereka, segera panggil set_customer_name — layar Bayar pesanan Anda terbuka saat itu.\n" +
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
      `Language:\n${languagePresets[language]}`,
      `Store: ${business.name} — ${business.tagline}`,
    );
    if (orderingEnabled || bookingEnabled) {
      sections.push(
        `${bookingEnabled ? "Treatments" : "Menu"}:\n${treatmentLines || (bookingEnabled ? "- No treatments configured yet." : "- No menu items configured yet.")}`,
      );
      if (bookingEnabled && staffLines) {
        sections.push(`Doctors:\n${staffLines}`);
      }
    }
    sections.push(`Knowledge:\n${knowledgeLines || "- No knowledge entries configured yet."}`);
    if (behavioral.trim()) sections.push(`Behavior rules:\n${behavioral.trim()}`);
    {
      const customTools = toolInstructions.trim();
      const toolsSection = bookingEnabled
        ? [customTools, defaultToolsEn].filter(Boolean).join("\n\n")
        : customTools || defaultToolsEn;
      // Always append the authoritative closing so SPM / name-last rules override templates.
      const checkoutClosing =
        orderingEnabled && !bookingEnabled
          ? `\n\n${ORDER_PRICE_RECALL_EN}\n\n${resolveFoodCheckoutClosing("en", options)}`
          : "";
      sections.push(toolsSection + checkoutClosing);
    }
  } else {
    sections.push(
      `Namamu adalah ${assistantName}. Gunakan nama ini saat memperkenalkan diri.`,
      personality.trim(),
      tonePresets[tone]!,
      `Bahasa:\n${languagePresets[language]}`,
      `Toko: ${business.name} — ${business.tagline}`,
    );
    if (orderingEnabled || bookingEnabled) {
      sections.push(
        `${bookingEnabled ? "Treatment" : "Menu"}:\n${treatmentLines || (bookingEnabled ? "- Belum ada treatment yang dikonfigurasi." : "- Belum ada menu yang dikonfigurasi.")}`,
      );
      if (bookingEnabled && staffLines) {
        sections.push(`Dokter:\n${staffLines}`);
      }
    }
    sections.push(`Pengetahuan:\n${knowledgeLines || "- Belum ada entri pengetahuan yang dikonfigurasi."}`);
    if (behavioral.trim()) sections.push(`Aturan perilaku:\n${behavioral.trim()}`);
    {
      const customTools = toolInstructions.trim();
      const toolsSection = bookingEnabled
        ? [customTools, defaultToolsId].filter(Boolean).join("\n\n")
        : customTools || defaultToolsId;
      const checkoutClosing =
        orderingEnabled && !bookingEnabled
          ? `\n\n${ORDER_PRICE_RECALL_ID}\n\n${resolveFoodCheckoutClosing("id", options)}`
          : "";
      sections.push(toolsSection + checkoutClosing);
    }
  }

  if (voiceSpeakingStyle) {
    sections.push(voiceSpeakingStyle);
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
