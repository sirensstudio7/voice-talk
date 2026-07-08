import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { resolve } from "node:path";
import { hashPassword } from "../src/auth/jwt.js";
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
  BUSINESS_NAME,
  BUSINESS_TAGLINE,
  KNOWLEDGE,
  PERSONALITY,
  PRODUCTS,
} from "../src/seed-data.js";

config({ path: resolve(process.cwd(), "../../.env") });
config();

async function seed() {
  const adminEmail = env.ADMIN_EMAIL;
  const adminPassword = env.ADMIN_PASSWORD;

  let user = await db.query.users.findFirst({ where: eq(users.email, adminEmail) });
  if (!user) {
    [user] = await db
      .insert(users)
      .values({
        email: adminEmail,
        passwordHash: await hashPassword(adminPassword),
        name: "Admin",
      })
      .returning();
    console.log(`Created admin user: ${adminEmail} / ${adminPassword}`);
  }

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
      })
      .returning();

    await db.insert(businessMembers).values({
      userId: user!.id,
      businessId: business!.id,
      role: "owner",
    });

    await db.insert(aiRules).values({
      businessId: business!.id,
      assistantName: "Lorescale",
      personality: PERSONALITY.trim(),
      tone: "friendly",
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

    for (const [index, content] of KNOWLEDGE.entries()) {
      await db.insert(knowledgeEntries).values({
        businessId: business!.id,
        category: "General",
        content,
        sortOrder: index,
      });
    }

    console.log(`Seeded ${PRODUCTS.length} products and ${KNOWLEDGE.length} knowledge entries`);
  }

  console.log("Database seed complete.");
  await closeDb();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
