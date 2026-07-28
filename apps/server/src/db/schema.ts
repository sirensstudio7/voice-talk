import { randomUUID } from "node:crypto";
import {
  boolean,
  date,
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
  status: varchar("status", { length: 20 }).notNull().default("active"),
  phone: varchar("phone", { length: 50 }).notNull().default(""),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const platformAdmins = pgTable("platform_admins", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  name: varchar("name", { length: 255 }).notNull().default(""),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  role: varchar("role", { length: 30 }).notNull().default("readonly"),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  totpSecret: varchar("totp_secret", { length: 255 }).notNull().default(""),
  totpEnabled: boolean("totp_enabled").notNull().default(false),
  forcePasswordReset: boolean("force_password_reset").notNull().default(false),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const platformSettings = pgTable("platform_settings", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: text("value").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const subscriptions = pgTable("subscriptions", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  businessId: varchar("business_id", { length: 36 })
    .notNull()
    .unique()
    .references(() => businesses.id),
  planName: varchar("plan_name", { length: 50 }).notNull().default("starter"),
  billingCycle: varchar("billing_cycle", { length: 20 }).notNull().default("monthly"),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  startDate: timestamp("start_date", { withTimezone: true }),
  endDate: timestamp("end_date", { withTimezone: true }),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLogs = pgTable("audit_logs", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  adminId: varchar("admin_id", { length: 36 })
    .notNull()
    .references(() => platformAdmins.id),
  action: varchar("action", { length: 100 }).notNull(),
  entityType: varchar("entity_type", { length: 50 }).notNull().default(""),
  entityId: varchar("entity_id", { length: 36 }).notNull().default(""),
  metadataJson: text("metadata_json").notNull().default("{}"),
  ipAddress: varchar("ip_address", { length: 64 }).notNull().default(""),
  userAgent: text("user_agent").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const demoRequests = pgTable("demo_requests", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  email: varchar("email", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 50 }).notNull(),
  companyName: varchar("company_name", { length: 255 }).notNull(),
  city: varchar("city", { length: 120 }).notNull(),
  country: varchar("country", { length: 120 }).notNull().default(""),
  businessIndustry: varchar("business_industry", { length: 100 }).notNull(),
  branchTotal: integer("branch_total").notNull(),
  preferredDate: date("preferred_date", { mode: "date" }),
  preferredTime: varchar("preferred_time", { length: 10 }).notNull().default(""),
  status: varchar("status", { length: 20 }).notNull().default("new"),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
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
  displayOrientation: varchar("display_orientation", { length: 10 }).notNull().default("landscape"),
  businessType: varchar("business_type", { length: 50 }).notNull().default(""),
  primaryUseCase: varchar("primary_use_case", { length: 20 }).notNull().default("both"),
  onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
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
    durationMin: integer("duration_min").notNull().default(30),
  },
  (table) => [unique("uq_product_slug").on(table.businessId, table.productId)],
);

export const businessHours = pgTable(
  "business_hours",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    businessId: varchar("business_id", { length: 36 })
      .notNull()
      .references(() => businesses.id),
    dayOfWeek: integer("day_of_week").notNull(),
    openTime: varchar("open_time", { length: 5 }).notNull().default("09:00"),
    closeTime: varchar("close_time", { length: 5 }).notNull().default("18:00"),
    isClosed: boolean("is_closed").notNull().default(false),
  },
  (table) => [unique("uq_business_hours_day").on(table.businessId, table.dayOfWeek)],
);

export const appointments = pgTable("appointments", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  businessId: varchar("business_id", { length: 36 })
    .notNull()
    .references(() => businesses.id),
  productId: varchar("product_id", { length: 100 }).notNull(),
  treatmentName: varchar("treatment_name", { length: 255 }).notNull(),
  customerName: varchar("customer_name", { length: 255 }).notNull(),
  customerPhone: varchar("customer_phone", { length: 50 }).notNull().default(""),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("scheduled"),
  voiceSessionId: varchar("voice_session_id", { length: 36 }).references(() => voiceSessions.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const knowledgeEntries = pgTable("knowledge_entries", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  businessId: varchar("business_id", { length: 36 })
    .notNull()
    .references(() => businesses.id),
  category: varchar("category", { length: 100 }).notNull().default("General"),
  title: varchar("title", { length: 200 }),
  content: text("content").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const visionSettings = pgTable("vision_settings", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  businessId: varchar("business_id", { length: 36 })
    .notNull()
    .unique()
    .references(() => businesses.id),
  cameraTriggerEnabled: boolean("camera_trigger_enabled").notNull().default(false),
  visionSource: varchar("vision_source", { length: 20 }).notNull().default("auto"),
  greetingTriggerMode: varchar("greeting_trigger_mode", { length: 20 })
    .notNull()
    .default("presence"),
  greetingDelaySeconds: integer("greeting_delay_seconds").notNull().default(3),
  detectionDistanceM: doublePrecision("detection_distance_m").notNull().default(2),
  cooldownSeconds: integer("cooldown_seconds").notNull().default(30),
  lostTimeoutSeconds: integer("lost_timeout_seconds").notNull().default(5),
  silenceTimeoutSeconds: integer("silence_timeout_seconds").notNull().default(15),
  autoGoodbyeTimeoutSeconds: integer("auto_goodbye_timeout_seconds").notNull().default(10),
  greetingScript: text("greeting_script")
    .notNull()
    .default("Hello, welcome. How may I assist you today?"),
  goodbyeScript: text("goodbye_script")
    .notNull()
    .default("Thank you. Have a wonderful day."),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const visionEvents = pgTable("vision_events", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  businessId: varchar("business_id", { length: 36 })
    .notNull()
    .references(() => businesses.id),
  kioskId: varchar("kiosk_id", { length: 100 }).notNull().default("default"),
  eventType: varchar("event_type", { length: 50 }).notNull(),
  trackId: integer("track_id"),
  metadata: text("metadata").notNull().default("{}"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const aiRules = pgTable("ai_rules", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  businessId: varchar("business_id", { length: 36 })
    .notNull()
    .unique()
    .references(() => businesses.id),
  assistantName: varchar("assistant_name", { length: 50 }).notNull().default("Lorescale"),
  avatarUrl: text("avatar_url").notNull().default(""),
  personality: text("personality").notNull(),
  tone: varchar("tone", { length: 20 }).notNull().default("friendly"),
  language: varchar("language", { length: 5 }).notNull().default("id"),
  behavioralRules: text("behavioral_rules").notNull().default(""),
  toolInstructions: text("tool_instructions").notNull().default(""),
  idleTimeoutSeconds: integer("idle_timeout_seconds").notNull().default(30),
  voicePreset: varchar("voice_preset", { length: 30 }).notNull().default("natural"),
});

export const voiceSessions = pgTable("voice_sessions", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  businessId: varchar("business_id", { length: 36 })
    .notNull()
    .references(() => businesses.id),
  status: varchar("status", { length: 50 }).notNull().default("active"),
  endReason: varchar("end_reason", { length: 50 }),
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
export type PlatformAdmin = typeof platformAdmins.$inferSelect;
export type PlatformSetting = typeof platformSettings.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type DemoRequest = typeof demoRequests.$inferSelect;
export type Business = typeof businesses.$inferSelect;
export type Product = typeof products.$inferSelect;
export type KnowledgeEntry = typeof knowledgeEntries.$inferSelect;
export type AiRules = typeof aiRules.$inferSelect;
export type VisionSettings = typeof visionSettings.$inferSelect;
export type VisionEvent = typeof visionEvents.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type VoiceSession = typeof voiceSessions.$inferSelect;
export type TranscriptMessage = typeof transcriptMessages.$inferSelect;
export type BusinessHours = typeof businessHours.$inferSelect;
export type Appointment = typeof appointments.$inferSelect;

export type BusinessWithRelations = Business & {
  products: Product[];
  knowledgeEntries: KnowledgeEntry[];
  aiRules: AiRules | null;
};
