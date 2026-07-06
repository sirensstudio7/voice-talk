import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  aiRules,
  businesses,
  knowledgeEntries,
  products,
  type Business,
} from "../db/schema.js";
import type { BusinessWithRelations } from "../services/config-builder.js";

export async function getBusinessBySlug(slug: string): Promise<BusinessWithRelations | null> {
  const business = await db.query.businesses.findFirst({
    where: (b, { and, eq: eqFn }) => and(eqFn(b.slug, slug), eqFn(b.isActive, true)),
  });
  if (!business) return null;

  const [productList, knowledgeList, rules] = await Promise.all([
    db.select().from(products).where(eq(products.businessId, business.id)),
    db.select().from(knowledgeEntries).where(eq(knowledgeEntries.businessId, business.id)),
    db.query.aiRules.findFirst({ where: eq(aiRules.businessId, business.id) }),
  ]);

  return {
    ...business,
    products: productList,
    knowledgeEntries: knowledgeList,
    aiRules: rules ?? null,
  };
}

export async function getBusinessWithRelations(businessId: string): Promise<BusinessWithRelations | null> {
  const business = await db.query.businesses.findFirst({
    where: eq(businesses.id, businessId),
  });
  if (!business) return null;

  const [productList, knowledgeList, rules] = await Promise.all([
    db.select().from(products).where(eq(products.businessId, business.id)),
    db.select().from(knowledgeEntries).where(eq(knowledgeEntries.businessId, business.id)),
    db.query.aiRules.findFirst({ where: eq(aiRules.businessId, business.id) }),
  ]);

  return {
    ...business,
    products: productList,
    knowledgeEntries: knowledgeList,
    aiRules: rules ?? null,
  };
}

export function mapBusinessRow(business: Business) {
  return {
    id: business.id,
    slug: business.slug,
    name: business.name,
    tagline: business.tagline,
    voice_name: business.voiceName,
    gemini_model: business.geminiModel,
    is_active: business.isActive,
  };
}
