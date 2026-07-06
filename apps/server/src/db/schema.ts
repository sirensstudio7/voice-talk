import { randomUUID } from "node:crypto";
import {
  boolean,
  doublePrecision,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const businesses = pgTable("businesses", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  tagline: varchar("tagline", { length: 500 }).notNull().default(""),
  voiceName: varchar("voice_name", { length: 50 }).notNull().default("Aoede"),
  geminiModel: varchar("gemini_model", { length: 100 })
    .notNull()
    .default("gemini-3.1-flash-live-preview"),
  paymentQrUrl: text("payment_qr_url").notNull().default(""),
  backgroundUrl: text("background_url").notNull().default(""),
  gradientColor: varchar("gradient_color", { length: 7 }).notNull().default(""),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const businessMembers = pgTable(
  "business_members",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id),
    businessId: varchar("business_id", { length: 36 })
      .notNull()
      .references(() => businesses.id),
    role: varchar("role", { length: 50 }).notNull().default("owner"),
  },
  (table) => [unique("uq_member").on(table.userId, table.businessId)],
);

export const products = pgTable(
  "products",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    businessId: varchar("business_id", { length: 36 })
      .notNull()
      .references(() => businesses.id),
    productId: varchar("product_id", { length: 100 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    price: doublePrecision("price").notNull(),
    discountPercent: doublePrecision("discount_percent").notNull().default(0),
    category: varchar("category", { length: 100 }).notNull(),
    description: text("description").notNull().default(""),
    imageUrl: text("image_url").notNull().default(""),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [unique("uq_product_slug").on(table.businessId, table.productId)],
);

export const knowledgeEntries = pgTable("knowledge_entries", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  businessId: varchar("business_id", { length: 36 })
    .notNull()
    .references(() => businesses.id),
  category: varchar("category", { length: 100 }).notNull().default("General"),
  content: text("content").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const aiRules = pgTable("ai_rules", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  businessId: varchar("business_id", { length: 36 })
    .notNull()
    .unique()
    .references(() => businesses.id),
  assistantName: varchar("assistant_name", { length: 50 }).notNull().default("Eva"),
  personality: text("personality").notNull(),
  tone: varchar("tone", { length: 20 }).notNull().default("friendly"),
  language: varchar("language", { length: 5 }).notNull().default("id"),
  behavioralRules: text("behavioral_rules").notNull().default(""),
  toolInstructions: text("tool_instructions").notNull().default(""),
});

export const voiceSessions = pgTable("voice_sessions", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  businessId: varchar("business_id", { length: 36 })
    .notNull()
    .references(() => businesses.id),
  status: varchar("status", { length: 50 }).notNull().default("active"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
});

export const transcriptMessages = pgTable("transcript_messages", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  voiceSessionId: varchar("voice_session_id", { length: 36 })
    .notNull()
    .references(() => voiceSessions.id),
  role: varchar("role", { length: 20 }).notNull(),
  text: text("text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const orders = pgTable("orders", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  businessId: varchar("business_id", { length: 36 })
    .notNull()
    .references(() => businesses.id),
  voiceSessionId: varchar("voice_session_id", { length: 36 }).references(() => voiceSessions.id),
  status: varchar("status", { length: 50 }).notNull().default("open"),
  total: doublePrecision("total").notNull().default(0),
  customerName: varchar("customer_name", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
});

export const orderItems = pgTable("order_items", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  orderId: varchar("order_id", { length: 36 })
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  productId: varchar("product_id", { length: 100 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  price: doublePrecision("price").notNull(),
  quantity: integer("quantity").notNull().default(1),
});

export type User = typeof users.$inferSelect;
export type Business = typeof businesses.$inferSelect;
export type Product = typeof products.$inferSelect;
export type KnowledgeEntry = typeof knowledgeEntries.$inferSelect;
export type AiRules = typeof aiRules.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type VoiceSession = typeof voiceSessions.$inferSelect;
export type TranscriptMessage = typeof transcriptMessages.$inferSelect;

export type BusinessWithRelations = Business & {
  products: Product[];
  knowledgeEntries: KnowledgeEntry[];
  aiRules: AiRules | null;
};
