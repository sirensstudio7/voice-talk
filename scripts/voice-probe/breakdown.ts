import { buildSystemInstruction } from "../../apps/server/src/services/config-builder.ts";
import { KNOWLEDGE, PRODUCTS, PERSONALITY, BEHAVIORAL_RULES, TOOL_INSTRUCTIONS } from "../../apps/server/src/seed-data.ts";
const KEY = process.env.GEMINI_KEY;

function biz({ products = true, knowledge = true, rules = true } = {}) {
  return {
    id: "b1", name: "Sunrise Coffee", slug: "s", businessType: "cafe", primaryUseCase: "both",
    products: products ? PRODUCTS.map((p, i) => ({ id: p.id, name: p.name, price: p.price, category: p.category, description: p.description, isActive: true, liveOnly: false, sortOrder: i, discountPercent: 0 })) : [],
    knowledgeEntries: knowledge ? KNOWLEDGE.map((k, i) => ({ id: `k${i}`, title: k.title, content: k.content, category: "general", sortOrder: i })) : [],
    aiRules: rules ? { personality: PERSONALITY, behavioralRules: BEHAVIORAL_RULES, toolInstructions: TOOL_INSTRUCTIONS, tone: "warm", language: "id", voicePreset: null, idleTimeoutSeconds: 30 } : null,
  };
}

async function count(text: string) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:countTokens?key=${KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text }] }] }),
  });
  return (await r.json()).totalTokens;
}

const variants: [string, any][] = [
  ["full (as shipped)", biz()],
  ["products removed (-> tool lookup)", biz({ products: false })],
  ["knowledge removed", biz({ knowledge: false })],
  ["products + knowledge removed", biz({ products: false, knowledge: false })],
  ["defaults only, no custom rules", biz({ rules: false })],
];

const full = await count(buildSystemInstruction(variants[0][1] as never, null, {}));
console.log("component                     tokens   saving vs full");
for (const [label, b] of variants) {
  const t = await count(buildSystemInstruction(b as never, null, {}));
  const save = label === "full (as shipped)" ? "" : `${Math.round((1 - t / full) * 100)}%`;
  console.log(`${label.padEnd(30)}${String(t).padStart(6)}   ${save}`);
}
