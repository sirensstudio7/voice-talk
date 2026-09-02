import { config } from "dotenv";
import { and, eq } from "drizzle-orm";
import { resolve } from "node:path";
import { hashPassword } from "../src/auth/jwt.js";
import { ensurePlatformAdminSeed } from "../src/auth/platform-auth.js";
import { db, closeDb } from "../src/db/client.js";
import {
  aiRules,
  businesses,
  businessMembers,
  knowledgeEntries,
  products,
  users,
} from "../src/db/schema.js";
import { env } from "../src/env.js";
import {
  BEHAVIORAL_RULES,
  BUSINESS_NAME,
  BUSINESS_TAGLINE,
  KNOWLEDGE,
  PERSONALITY,
  PRODUCTS,
  TOOL_INSTRUCTIONS,
} from "../src/seed-data.js";
import {
  LORESCALE_ASSISTANT_NAME,
  LORESCALE_AVATAR_MODEL_PATH,
  LORESCALE_VOICE_PRESET,
  LORESCALE_VOICE_GENDER,
  LORESCALE_BEHAVIORAL_RULES,
  LORESCALE_BUSINESS_NAME,
  LORESCALE_KNOWLEDGE,
  LORESCALE_PERSONALITY,
  LORESCALE_TAGLINE,
  LORESCALE_TOOL_INSTRUCTIONS,
} from "../src/lorescale-seed-data.js";

config({ path: resolve(process.cwd(), "../../.env") });
config({ path: resolve(process.cwd(), "../../.env.local"), override: true });
config();

async function ensureUser(email: string, password: string, name: string) {
  let user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!user) {
    [user] = await db
      .insert(users)
      .values({
        email,
        passwordHash: await hashPassword(password),
        name,
      })
      .returning();
    console.log(`Created admin user: ${email} / ${password}`);
  }
  return user!;
}

async function ensurePendingUser(email: string, password: string, name: string) {
  let user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!user) {
    [user] = await db
      .insert(users)
      .values({
        email,
        passwordHash: await hashPassword(password),
        name,
        status: "pending",
      })
      .returning();
    console.log(`Created pending demo user: ${email} / ${password}`);
    return user!;
  }

  if (user.status !== "pending") {
    [user] = await db
      .update(users)
      .set({ status: "pending" })
      .where(eq(users.id, user.id))
      .returning();
    console.log(`Updated demo user to pending: ${email}`);
  }

  return user!;
}

async function ensureMembership(userId: string, businessId: string, slug: string) {
  const membership = await db.query.businessMembers.findFirst({
    where: and(eq(businessMembers.userId, userId), eq(businessMembers.businessId, businessId)),
  });
  if (!membership) {
    await db.insert(businessMembers).values({
      userId,
      businessId,
      role: "owner",
    });
    console.log(`Linked user to business: ${slug}`);
  }
}

async function removeMembership(userId: string, businessId: string, slug: string) {
  const membership = await db.query.businessMembers.findFirst({
    where: and(eq(businessMembers.userId, userId), eq(businessMembers.businessId, businessId)),
  });
  if (membership) {
    await db.delete(businessMembers).where(eq(businessMembers.id, membership.id));
    console.log(`Removed user from business: ${slug}`);
  }
}

async function seed() {
  const sunriseAdmin = await ensureUser(env.ADMIN_EMAIL, env.ADMIN_PASSWORD, "Sunrise Admin");
  const lorescaleAdmin = await ensureUser(
    env.LORESCALE_ADMIN_EMAIL,
    env.LORESCALE_ADMIN_PASSWORD,
    "Lorescale Admin",
  );

  let business = await db.query.businesses.findFirst({
    where: eq(businesses.slug, "sunrise-coffee"),
  });

  if (!business) {
    [business] = await db
      .insert(businesses)
      .values({
        slug: "sunrise-coffee",
        name: BUSINESS_NAME,
        tagline: BUSINESS_TAGLINE,
        businessType: "cafe",
        primaryUseCase: "both",
        onboardingCompleted: true,
      })
      .returning();

    await db.insert(aiRules).values({
      businessId: business!.id,
      assistantName: "Lorescale",
      personality: PERSONALITY.trim(),
      tone: "friendly",
      language: "id",
      behavioralRules: BEHAVIORAL_RULES.trim(),
      toolInstructions: TOOL_INSTRUCTIONS.trim(),
    });

    console.log("Created business: sunrise-coffee");

    for (const [index, product] of PRODUCTS.entries()) {
      await db.insert(products).values({
        businessId: business!.id,
        productId: product.id,
        name: product.name,
        price: product.price,
        category: product.category,
        description: product.description,
        imageUrl: product.image_url,
        sortOrder: index,
      });
    }

    for (const [index, entry] of KNOWLEDGE.entries()) {
      await db.insert(knowledgeEntries).values({
        businessId: business!.id,
        category: "General",
        title: entry.title,
        content: entry.content,
        sortOrder: index,
      });
    }

    console.log(`Seeded ${PRODUCTS.length} products and ${KNOWLEDGE.length} knowledge entries`);
  }

  await ensureMembership(sunriseAdmin.id, business!.id, "sunrise-coffee");
  await removeMembership(lorescaleAdmin.id, business!.id, "sunrise-coffee");

  let lorescaleBusiness = await db.query.businesses.findFirst({
    where: eq(businesses.slug, "lorescale"),
  });

  if (!lorescaleBusiness) {
    [lorescaleBusiness] = await db
      .insert(businesses)
      .values({
        slug: "lorescale",
        name: LORESCALE_BUSINESS_NAME,
        tagline: LORESCALE_TAGLINE,
        businessType: "saas",
        primaryUseCase: "faqs",
        onboardingCompleted: true,
      })
      .returning();

    await db.insert(aiRules).values({
      businessId: lorescaleBusiness!.id,
      assistantName: LORESCALE_ASSISTANT_NAME,
      avatarModelPath: LORESCALE_AVATAR_MODEL_PATH,
      voicePreset: LORESCALE_VOICE_PRESET,
      voiceGender: LORESCALE_VOICE_GENDER,
      personality: LORESCALE_PERSONALITY.trim(),
      tone: "professional",
      language: "en",
      behavioralRules: LORESCALE_BEHAVIORAL_RULES.trim(),
      toolInstructions: LORESCALE_TOOL_INSTRUCTIONS.trim(),
    });

    for (const [index, entry] of LORESCALE_KNOWLEDGE.entries()) {
      await db.insert(knowledgeEntries).values({
        businessId: lorescaleBusiness!.id,
        category: "Product",
        title: entry.title,
        content: entry.content,
        sortOrder: index,
      });
    }

    console.log(
      `Created business: lorescale with ${LORESCALE_KNOWLEDGE.length} knowledge entries`,
    );
  }

  await db
    .update(aiRules)
    .set({
      assistantName: LORESCALE_ASSISTANT_NAME,
      avatarModelPath: LORESCALE_AVATAR_MODEL_PATH,
      voicePreset: LORESCALE_VOICE_PRESET,
      voiceGender: LORESCALE_VOICE_GENDER,
      personality: LORESCALE_PERSONALITY.trim(),
      tone: "professional",
      language: "en",
      behavioralRules: LORESCALE_BEHAVIORAL_RULES.trim(),
      toolInstructions: LORESCALE_TOOL_INSTRUCTIONS.trim(),
    })
    .where(eq(aiRules.businessId, lorescaleBusiness!.id));

  const lorescaleRules = await db.query.aiRules.findFirst({
    where: eq(aiRules.businessId, lorescaleBusiness!.id),
  });
  if (!lorescaleRules) {
    await db.insert(aiRules).values({
      businessId: lorescaleBusiness!.id,
      assistantName: LORESCALE_ASSISTANT_NAME,
      avatarModelPath: LORESCALE_AVATAR_MODEL_PATH,
      voicePreset: LORESCALE_VOICE_PRESET,
      voiceGender: LORESCALE_VOICE_GENDER,
      personality: LORESCALE_PERSONALITY.trim(),
      tone: "professional",
      language: "en",
      behavioralRules: LORESCALE_BEHAVIORAL_RULES.trim(),
      toolInstructions: LORESCALE_TOOL_INSTRUCTIONS.trim(),
    });
  }
  console.log("Synced lorescale AI rules");

  await db.delete(knowledgeEntries).where(eq(knowledgeEntries.businessId, lorescaleBusiness!.id));
  for (const [index, entry] of LORESCALE_KNOWLEDGE.entries()) {
    await db.insert(knowledgeEntries).values({
      businessId: lorescaleBusiness!.id,
      category: "Product",
      title: entry.title,
      content: entry.content,
      sortOrder: index,
    });
  }
  console.log(`Synced ${LORESCALE_KNOWLEDGE.length} lorescale knowledge entries`);

  await removeMembership(sunriseAdmin.id, lorescaleBusiness!.id, "lorescale");
  await ensureMembership(lorescaleAdmin.id, lorescaleBusiness!.id, "lorescale");

  await ensurePlatformAdminSeed();

  await ensurePendingUser(
    "demo.pending@lorescale.com",
    "pendingdemo123",
    "Demo Pending User",
  );

  console.log("Database seed complete.");
  await closeDb();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
