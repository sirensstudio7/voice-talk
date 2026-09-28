import { randomUUID } from "node:crypto";
import { and, count, desc, eq, ilike, ne, or } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  addonRequests,
  addons,
  addonSubscriptions,
  businesses,
  businessMembers,
  campaignBannerSettings,
  luckySpinSettings,
  photoSettings,
  users,
  type Addon,
  type AddonRequest,
  type AddonSubscription,
  type PhotoSettings,
} from "../db/schema.js";
import {
  availableAiLanguages,
  isAiLanguage,
  isPackLanguage,
  type AiLanguage,
} from "@voicetalk/shared";
import { hasServiceAccessForBusiness } from "./entitlement.js";

export const SMART_PHOTO_MOMENT_CODE = "smart_photo_moment";
export const LUCKY_SPIN_CODE = "lucky_spin";
export const AI_PRESENTER_CODE = "ai_presenter";
export const CAMPAIGN_BANNER_CODE = "campaign_banner";
export const LANGUAGE_PACK_CODE = "language_pack";
export const BOOKING_CODE = "booking";
export const LIVE_CODE = "live";

export const DEFAULT_PHOTO_VOICE_PROMPT =
  "Mau foto untuk kenang-kenangan setelah bayar nanti? Jawab ya atau tidak.";

export const DEFAULT_PHOTO_READY_PROMPT = "Siap-siap ya untuk foto!";

function httpError(message: string, statusCode: number): Error & { statusCode: number } {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = statusCode;
  return err;
}

export function generateAddonTransactionCode(prefix = "SPM") {
  const part = randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  return `${prefix}-${part}`;
}

export async function getAddonByCode(code: string): Promise<Addon | null> {
  const [row] = await db.select().from(addons).where(eq(addons.code, code)).limit(1);
  return row ?? null;
}

export async function listAddons(): Promise<Addon[]> {
  const rows = await db.select().from(addons);
  return rows.sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function hasActiveAddon(businessId: string, addonCode: string): Promise<boolean> {
  const [sub] = await db
    .select()
    .from(addonSubscriptions)
    .where(
      and(
        eq(addonSubscriptions.businessId, businessId),
        eq(addonSubscriptions.addonCode, addonCode),
        eq(addonSubscriptions.status, "active"),
      ),
    )
    .limit(1);
  if (!sub) return false;
  if (sub.endsAt && sub.endsAt.getTime() < Date.now()) return false;
  return true;
}

export async function getOrCreatePhotoSettings(businessId: string): Promise<PhotoSettings> {
  const [existing] = await db
    .select()
    .from(photoSettings)
    .where(eq(photoSettings.businessId, businessId))
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(photoSettings)
    .values({ businessId })
    .returning();
  return created!;
}

export type SmartPhotoMomentPublicConfig = {
  active: boolean;
  enabled: boolean;
  voice_prompt: string;
  countdown_seconds: number;
};

export async function getSmartPhotoMomentPublicConfig(
  businessId: string,
): Promise<SmartPhotoMomentPublicConfig> {
  const [active, settings, serviceOk] = await Promise.all([
    hasActiveAddon(businessId, SMART_PHOTO_MOMENT_CODE),
    getOrCreatePhotoSettings(businessId),
    hasServiceAccessForBusiness(businessId),
  ]);

  return {
    active: active && serviceOk,
    enabled: settings.enabled,
    voice_prompt: settings.voicePrompt || DEFAULT_PHOTO_VOICE_PROMPT,
    countdown_seconds: settings.countdownSeconds,
  };
}

export async function isPhotoMomentAvailable(businessId: string): Promise<boolean> {
  const cfg = await getSmartPhotoMomentPublicConfig(businessId);
  return cfg.active && cfg.enabled;
}

export type LanguagePackPublicConfig = {
  active: boolean;
  available: AiLanguage[];
};

export async function assertLanguageAllowed(
  businessId: string,
  language: string,
): Promise<AiLanguage> {
  const pack = await hasActiveAddon(businessId, LANGUAGE_PACK_CODE);
  if (!isAiLanguage(language)) {
    throw httpError("Unsupported language", 400);
  }
  if (isPackLanguage(language) && !pack) {
    throw httpError("Language Pack add-on is required for this language", 403);
  }
  return language;
}

export async function getLanguagePackPublicConfig(
  businessId: string,
): Promise<LanguagePackPublicConfig> {
  const [active, serviceOk] = await Promise.all([
    hasActiveAddon(businessId, LANGUAGE_PACK_CODE),
    hasServiceAccessForBusiness(businessId),
  ]);
  const packOn = active && serviceOk;
  return {
    active: packOn,
    available: availableAiLanguages(packOn),
  };
}

export type AddonStatusForBusiness = {
  addon: {
    code: string;
    name: string;
    description: string;
    price_display: string;
    monthly_price_idr: number;
    discount_3m_percent: number;
    discount_6m_percent: number;
    discount_12m_percent: number;
  };
  subscription_status: string;
  starts_at: string | null;
  ends_at: string | null;
  pending_request: {
    id: string;
    status: string;
    created_at: string;
  } | null;
  settings: ReturnType<typeof photoSettingsOut>;
};

export function photoSettingsOut(settings: PhotoSettings) {
  return {
    enabled: settings.enabled,
    voice_prompt: settings.voicePrompt,
    countdown_seconds: settings.countdownSeconds,
    qr_expiry_hours: settings.qrExpiryHours,
    logo_url: settings.logoUrl ?? "",
    frame_url: settings.frameUrl ?? "",
    campaign_text: settings.campaignText ?? "",
    auto_delete_days: settings.autoDeleteDays,
    updated_at: settings.updatedAt.toISOString(),
  };
}

const STUB_PHOTO_SETTINGS: ReturnType<typeof photoSettingsOut> = {
  enabled: false,
  voice_prompt: "",
  countdown_seconds: 3,
  qr_expiry_hours: 24,
  logo_url: "",
  frame_url: "",
  campaign_text: "",
  auto_delete_days: 7,
  updated_at: new Date(0).toISOString(),
};

function toAddonStatusPayload(
  addon: Addon,
  sub: AddonSubscription | undefined,
  pending: AddonRequest | undefined,
  settings: ReturnType<typeof photoSettingsOut>,
): AddonStatusForBusiness {
  return {
    addon: {
      code: addon.code,
      name: addon.name,
      description: addon.description,
      price_display: addon.priceDisplay,
      monthly_price_idr: addon.monthlyPriceIdr,
      discount_3m_percent: addon.discount3mPercent,
      discount_6m_percent: addon.discount6mPercent,
      discount_12m_percent: addon.discount12mPercent,
    },
    subscription_status: sub?.status ?? "inactive",
    starts_at: sub?.startsAt?.toISOString() ?? null,
    ends_at: sub?.endsAt?.toISOString() ?? null,
    pending_request: pending
      ? {
          id: pending.id,
          status: pending.status,
          created_at: pending.createdAt.toISOString(),
        }
      : null,
    settings,
  };
}

export async function getAddonStatusForBusiness(
  businessId: string,
  addonCode = SMART_PHOTO_MOMENT_CODE,
): Promise<AddonStatusForBusiness> {
  // Sequential queries — managed poolers cap connections low; Promise.all of
  // 3–4 lookups competes with vision/health and causes CONNECT_TIMEOUT.
  const addon = await getAddonByCode(addonCode);
  if (!addon) throw httpError("Add-on not found", 404);

  const [sub] = await db
    .select()
    .from(addonSubscriptions)
    .where(
      and(
        eq(addonSubscriptions.businessId, businessId),
        eq(addonSubscriptions.addonCode, addonCode),
      ),
    )
    .limit(1);

  const [pending] = await db
    .select()
    .from(addonRequests)
    .where(
      and(
        eq(addonRequests.businessId, businessId),
        eq(addonRequests.addonCode, addonCode),
        eq(addonRequests.status, "pending"),
      ),
    )
    .limit(1);

  // Only SPM status includes photo settings. Other add-ons get a stub so the
  // response shape stays stable without creating photo_settings rows.
  const settings =
    addonCode === SMART_PHOTO_MOMENT_CODE
      ? photoSettingsOut(await getOrCreatePhotoSettings(businessId))
      : STUB_PHOTO_SETTINGS;

  return toAddonStatusPayload(addon, sub, pending, settings);
}

export async function listAddonStatusesForBusiness(
  businessId: string,
): Promise<AddonStatusForBusiness[]> {
  const catalog = await listAddons();
  const subs = await db
    .select()
    .from(addonSubscriptions)
    .where(eq(addonSubscriptions.businessId, businessId));
  const pendingRows = await db
    .select()
    .from(addonRequests)
    .where(
      and(eq(addonRequests.businessId, businessId), eq(addonRequests.status, "pending")),
    );

  const photoSettings = catalog.some((addon) => addon.code === SMART_PHOTO_MOMENT_CODE)
    ? photoSettingsOut(await getOrCreatePhotoSettings(businessId))
    : STUB_PHOTO_SETTINGS;

  const subByCode = new Map(subs.map((sub) => [sub.addonCode, sub]));
  const pendingByCode = new Map<string, AddonRequest>();
  for (const row of pendingRows) {
    const existing = pendingByCode.get(row.addonCode);
    if (!existing || row.createdAt.getTime() > existing.createdAt.getTime()) {
      pendingByCode.set(row.addonCode, row);
    }
  }

  return catalog.map((addon) =>
    toAddonStatusPayload(
      addon,
      subByCode.get(addon.code),
      pendingByCode.get(addon.code),
      addon.code === SMART_PHOTO_MOMENT_CODE ? photoSettings : STUB_PHOTO_SETTINGS,
    ),
  );
}

export async function createAddonRequest(
  userId: string,
  businessId: string,
  addonCode: string,
  notes = "",
  paymentProofUrl: string | null = null,
  transactionCode?: string | null,
): Promise<{ requestId: string; transactionCode: string; addon: Addon }> {
  const addon = await getAddonByCode(addonCode);
  if (!addon) throw httpError("Add-on not found", 404);

  const membership = await db.query.businessMembers.findFirst({
    where: and(eq(businessMembers.userId, userId), eq(businessMembers.businessId, businessId)),
  });
  if (!membership) throw httpError("Business not found", 404);

  const active = await hasActiveAddon(businessId, addonCode);
  if (active) throw httpError("Add-on is already active for this workspace", 400);

  // Replace existing pending request for this business+addon.
  await db
    .update(addonRequests)
    .set({ status: "rejected", reviewedAt: new Date(), notes: "Superseded by new request" })
    .where(
      and(
        eq(addonRequests.businessId, businessId),
        eq(addonRequests.addonCode, addonCode),
        eq(addonRequests.status, "pending"),
      ),
    );

  const normalizedCode = (transactionCode ?? "").trim().toUpperCase();
  const code =
    normalizedCode && /^[A-Z0-9]+-[A-Z0-9]{6,12}$/.test(normalizedCode)
      ? normalizedCode
      : generateAddonTransactionCode();

  const existingCode = await db.query.addonRequests.findFirst({
    where: eq(addonRequests.transactionCode, code),
  });
  const finalCode = existingCode ? generateAddonTransactionCode() : code;

  const [created] = await db
    .insert(addonRequests)
    .values({
      businessId,
      userId,
      addonCode,
      status: "pending",
      notes: notes.trim().slice(0, 4000),
      paymentProofUrl,
      transactionCode: finalCode,
    })
    .returning();

  return { requestId: created!.id, transactionCode: created!.transactionCode, addon };
}

export async function approveAddonRequest(params: {
  requestId: string;
  adminId: string;
  durationMonths?: number | null;
  customEndsAt?: Date | null;
  notes?: string;
}): Promise<AddonSubscription> {
  const req = await db.query.addonRequests.findFirst({
    where: eq(addonRequests.id, params.requestId),
  });
  if (!req) throw httpError("Request not found", 404);
  if (req.status !== "pending") throw httpError("Request is not pending", 400);

  const now = new Date();
  let endsAt: Date | null = params.customEndsAt ?? null;
  if (!endsAt && params.durationMonths) {
    endsAt = new Date(now);
    endsAt.setMonth(endsAt.getMonth() + params.durationMonths);
  }
  if (!endsAt) {
    endsAt = new Date(now);
    endsAt.setMonth(endsAt.getMonth() + 12);
  }

  const existing = await db.query.addonSubscriptions.findFirst({
    where: and(
      eq(addonSubscriptions.businessId, req.businessId),
      eq(addonSubscriptions.addonCode, req.addonCode),
    ),
  });

  let sub: AddonSubscription;
  if (existing) {
    const [updated] = await db
      .update(addonSubscriptions)
      .set({
        status: "active",
        startsAt: now,
        endsAt,
        updatedAt: now,
      })
      .where(eq(addonSubscriptions.id, existing.id))
      .returning();
    sub = updated!;
  } else {
    const [created] = await db
      .insert(addonSubscriptions)
      .values({
        businessId: req.businessId,
        addonCode: req.addonCode,
        status: "active",
        startsAt: now,
        endsAt,
      })
      .returning();
    sub = created!;
  }

  await db
    .update(addonRequests)
    .set({
      status: "approved",
      reviewedAt: now,
      reviewedBy: params.adminId,
      notes: params.notes ?? req.notes,
    })
    .where(eq(addonRequests.id, req.id));

  // Reject other pending for same business+addon
  await db
    .update(addonRequests)
    .set({
      status: "rejected",
      reviewedAt: now,
      reviewedBy: params.adminId,
      notes: "Approved another request",
    })
    .where(
      and(
        eq(addonRequests.businessId, req.businessId),
        eq(addonRequests.addonCode, req.addonCode),
        eq(addonRequests.status, "pending"),
        ne(addonRequests.id, req.id),
      ),
    );

  // Enable feature settings only for the approved add-on (never cross-wire).
  if (req.addonCode === SMART_PHOTO_MOMENT_CODE) {
    await getOrCreatePhotoSettings(req.businessId);
    await db
      .update(photoSettings)
      .set({ enabled: true, updatedAt: now })
      .where(eq(photoSettings.businessId, req.businessId));
  } else if (req.addonCode === LUCKY_SPIN_CODE) {
    const [existing] = await db
      .select()
      .from(luckySpinSettings)
      .where(eq(luckySpinSettings.businessId, req.businessId))
      .limit(1);
    if (existing) {
      await db
        .update(luckySpinSettings)
        .set({ enabled: true, updatedAt: now })
        .where(eq(luckySpinSettings.businessId, req.businessId));
    } else {
      await db.insert(luckySpinSettings).values({
        businessId: req.businessId,
        enabled: true,
        updatedAt: now,
      });
    }
  } else if (req.addonCode === CAMPAIGN_BANNER_CODE) {
    const [existing] = await db
      .select()
      .from(campaignBannerSettings)
      .where(eq(campaignBannerSettings.businessId, req.businessId))
      .limit(1);
    if (existing) {
      await db
        .update(campaignBannerSettings)
        .set({ enabled: true, updatedAt: now })
        .where(eq(campaignBannerSettings.businessId, req.businessId));
    } else {
      await db.insert(campaignBannerSettings).values({
        businessId: req.businessId,
        enabled: true,
        updatedAt: now,
      });
    }
  }

  return sub;
}

export async function rejectAddonRequest(params: {
  requestId: string;
  adminId: string;
  notes?: string;
}): Promise<AddonRequest> {
  const req = await db.query.addonRequests.findFirst({
    where: eq(addonRequests.id, params.requestId),
  });
  if (!req) throw httpError("Request not found", 404);
  if (req.status !== "pending") throw httpError("Request is not pending", 400);

  const [updated] = await db
    .update(addonRequests)
    .set({
      status: "rejected",
      reviewedAt: new Date(),
      reviewedBy: params.adminId,
      notes: params.notes ?? req.notes,
    })
    .where(eq(addonRequests.id, req.id))
    .returning();
  return updated!;
}

export async function suspendAddon(params: {
  businessId: string;
  addonCode: string;
  adminId: string;
  notes?: string;
}): Promise<AddonSubscription> {
  const existing = await db.query.addonSubscriptions.findFirst({
    where: and(
      eq(addonSubscriptions.businessId, params.businessId),
      eq(addonSubscriptions.addonCode, params.addonCode),
    ),
  });
  if (!existing) throw httpError("Add-on subscription not found", 404);

  const [updated] = await db
    .update(addonSubscriptions)
    .set({ status: "suspended", updatedAt: new Date() })
    .where(eq(addonSubscriptions.id, existing.id))
    .returning();

  // Only disable the suspended add-on's own feature flag.
  if (params.addonCode === SMART_PHOTO_MOMENT_CODE) {
    await db
      .update(photoSettings)
      .set({ enabled: false, updatedAt: new Date() })
      .where(eq(photoSettings.businessId, params.businessId));
  } else if (params.addonCode === LUCKY_SPIN_CODE) {
    await db
      .update(luckySpinSettings)
      .set({ enabled: false, updatedAt: new Date() })
      .where(eq(luckySpinSettings.businessId, params.businessId));
  } else if (params.addonCode === CAMPAIGN_BANNER_CODE) {
    await db
      .update(campaignBannerSettings)
      .set({ enabled: false, updatedAt: new Date() })
      .where(eq(campaignBannerSettings.businessId, params.businessId));
  }

  return updated!;
}

export async function listAddonRequestRows(params: {
  status?: string;
  search?: string;
  limit: number;
  offset: number;
}) {
  const conditions = [];
  if (params.status) conditions.push(eq(addonRequests.status, params.status));
  if (params.search) {
    const q = `%${params.search}%`;
    conditions.push(
      or(
        ilike(businesses.name, q),
        ilike(businesses.slug, q),
        ilike(users.name, q),
        ilike(users.email, q),
        ilike(addonRequests.transactionCode, q),
      )!,
    );
  }
  const whereClause = conditions.length ? and(...conditions) : undefined;

  const [totalRow] = await db
    .select({ value: count() })
    .from(addonRequests)
    .innerJoin(businesses, eq(businesses.id, addonRequests.businessId))
    .innerJoin(users, eq(users.id, addonRequests.userId))
    .where(whereClause);

  const items = await db
    .select({
      id: addonRequests.id,
      status: addonRequests.status,
      createdAt: addonRequests.createdAt,
      reviewedAt: addonRequests.reviewedAt,
      notes: addonRequests.notes,
      paymentProofUrl: addonRequests.paymentProofUrl,
      transactionCode: addonRequests.transactionCode,
      addonCode: addonRequests.addonCode,
      businessId: businesses.id,
      businessName: businesses.name,
      businessSlug: businesses.slug,
      userId: users.id,
      userName: users.name,
      userEmail: users.email,
      addonName: addons.name,
    })
    .from(addonRequests)
    .innerJoin(businesses, eq(businesses.id, addonRequests.businessId))
    .innerJoin(users, eq(users.id, addonRequests.userId))
    .innerJoin(addons, eq(addons.code, addonRequests.addonCode))
    .where(whereClause)
    .orderBy(desc(addonRequests.createdAt))
    .limit(params.limit)
    .offset(params.offset);

  return { items, total: totalRow?.value ?? 0 };
}
