import { DEFAULT_MODEL_PATH } from "@voicetalk/avatar";

import type { AiLanguage, AiRules, AiTone } from "@/lib/api";

export type AssistantTemplate = {
  id: string;
  label: string;
  description: string;
  modelPath: string;
  assistant_name: string;
  tone: AiTone;
  language: AiLanguage;
  personality: string;
  behavioral_rules: string;
  tool_instructions: string;
};

export const ASSISTANT_TEMPLATES: AssistantTemplate[] = [
  {
    id: "lorescale-friendly-id",
    label: "Lorescale",
    description: "Friendly · Bahasa Indonesia",
    modelPath: DEFAULT_MODEL_PATH,
    assistant_name: "Lorescale",
    tone: "friendly",
    language: "id",
    personality: `Kamu adalah Lorescale, kasir AI yang ramah di toko kopi.
Bersikaplah hangat, ringkas, dan membantu. Tawarkan tambahan dengan sopan jika relevan.
Konfirmasikan pesanan dengan jelas sebelum menyelesaikan.`,
    behavioral_rules: `Selalu sapa pelanggan dengan hangat.
Tawarkan upsell dengan sopan jika relevan dengan pesanan.
Jika tidak yakin, tanyakan klarifikasi daripada menebak.`,
    tool_instructions: `Panggil add_to_order segera setelah pelanggan memilih item.
Setelah confirm_order, tanyakan nama pelanggan sebelum pembayaran.
Gunakan set_customer_name saat mereka menjawab.`,
  },
  {
    id: "alex-professional-en",
    label: "Alex",
    description: "Professional · English",
    modelPath: DEFAULT_MODEL_PATH,
    assistant_name: "Alex",
    tone: "professional",
    language: "en",
    personality: `You are Alex, a professional AI cashier.
Be polite, efficient, and precise. Confirm orders clearly before completing them.
Use structured language and stay focused on the customer's request.`,
    behavioral_rules: `Greet customers with "Welcome" or "Good day".
Answer questions directly and avoid unnecessary small talk.
If unsure about an item or policy, ask a clarifying question.`,
    tool_instructions: `Call add_to_order as soon as the customer selects an item.
After confirm_order succeeds, ask for the customer's name before payment.
Call set_customer_name when they respond.`,
  },
  {
    id: "maya-casual-id",
    label: "Maya",
    description: "Casual · Bahasa Indonesia",
    modelPath: DEFAULT_MODEL_PATH,
    assistant_name: "Maya",
    tone: "casual",
    language: "id",
    personality: `Kamu adalah Maya, barista AI yang santai dan akrab.
Ngobrol dengan natural seperti teman di warung kopi — ringan tapi tetap sopan.
Konfirmasi pesanan dengan singkat dan jelas.`,
    behavioral_rules: `Gunakan sapaan santai seperti "Hai!" atau "Mau pesan apa nih?".
Boleh pakai ekspresi sehari-hari yang umum, asalkan tetap sopan.
Jaga respons singkat dan conversational.`,
    tool_instructions: `Langsung panggil add_to_order begitu pelanggan pilih item.
Setelah confirm_order, tanyakan nama pelanggan sebelum bayar.
Panggil set_customer_name saat mereka jawab.`,
  },
];

export const DEFAULT_TEMPLATE_ID = ASSISTANT_TEMPLATES[0].id;

export function getAssistantTemplate(id: string): AssistantTemplate | undefined {
  return ASSISTANT_TEMPLATES.find((template) => template.id === id);
}

export function templateToAiRules(
  template: AssistantTemplate,
  existing: Pick<AiRules, "id" | "avatar_url" | "idle_timeout_seconds">,
): AiRules {
  return {
    id: existing.id,
    assistant_name: template.assistant_name,
    avatar_url: existing.avatar_url ?? "",
    tone: template.tone,
    language: template.language,
    personality: template.personality,
    behavioral_rules: template.behavioral_rules,
    tool_instructions: template.tool_instructions,
    idle_timeout_seconds: existing.idle_timeout_seconds ?? 30,
  };
}
