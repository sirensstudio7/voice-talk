// Measures the real system-instruction size for a seeded merchant.
// Uses the repo's own buildSystemInstruction, then counts tokens via the free countTokens API.
import { writeFileSync } from "fs";
import { buildSystemInstruction } from "../../apps/server/src/services/config-builder.ts";
import { KNOWLEDGE, PRODUCTS, PERSONALITY, BEHAVIORAL_RULES, TOOL_INSTRUCTIONS } from "../../apps/server/src/seed-data.ts";

const KEY = process.env.GEMINI_KEY;

function business(opts = {}) {
  const products = PRODUCTS.slice(0, opts.productCount ?? PRODUCTS.length).map((p, i) => ({
    id: p.id, name: p.name, price: p.price, category: p.category, description: p.description,
    isActive: true, liveOnly: false, sortOrder: i, discountPercent: 0, imageUrl: p.image_url ?? "",
    businessId: "b1",
  }));
  const knowledgeEntries = KNOWLEDGE.slice(0, opts.knowledgeCount ?? KNOWLEDGE.length).map((k, i) => ({
    id: `k${i}`, title: k.title, content: k.content, category: "general", sortOrder: i, businessId: "b1",
  }));
  return {
    id: "b1", name: "Sunrise Coffee", slug: "sunrise-coffee", businessType: "cafe",
    primaryUseCase: "both", products, knowledgeEntries,
    aiRules: opts.noRules ? null : {
      personality: PERSONALITY, behavioralRules: BEHAVIORAL_RULES, toolInstructions: TOOL_INSTRUCTIONS,
      tone: "warm", language: "id", voicePreset: null, idleTimeoutSeconds: 30,
    },
  };
}

const cases = [
  ["seeded cafe (10 products, 5 KB entries, full custom rules)", business()],
  ["no custom rules (all defaults)", business({ noRules: true })],
  ["bigger menu: 40 products", business({ productCount: 40 })],
  ["heavy knowledge base: 25 entries x ~200 chars", (() => {
    const b = business();
    b.knowledgeEntries = Array.from({ length: 25 }, (_, i) => ({
      id: `k${i}`, title: `Topik ${i}`, content: "x".repeat(200), category: "general", sortOrder: i, businessId: "b1",
    }));
    return b;
  })()],
];

console.log("chars  tokens(approx via /4)  case");
const results = [];
for (const [label, biz] of cases) {
  const text = buildSystemInstruction(biz as never, null, {});
  results.push({ label, text });
  console.log(`${String(text.length).padStart(6)}  ${String(Math.round(text.length / 4)).padStart(6)}          ${label}`);
}

if (!KEY) { console.log("\n(no GEMINI_KEY - skipping exact countTokens)"); process.exit(0); }

console.log("\n=== exact token counts (countTokens API, free) ===");
for (const r of results) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:countTokens?key=${KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: r.text }] }] }),
  });
  const j = await res.json();
  console.log(`  ${String(j.totalTokens ?? "ERR").padStart(6)} tokens   ${r.label}${j.error ? "  " + j.error.message.slice(0, 80) : ""}`);
}

writeFileSync(new URL("./system-instruction.txt", import.meta.url), results[0].text);
console.log("\nfull seeded prompt written to system-instruction.txt (" + results[0].text.length + " chars)");
