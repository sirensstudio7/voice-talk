import { randomUUID } from "node:crypto";
import { and, asc, count, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  analyticsEvents,
  businesses,
  campaignBannerSettings,
  campaignBanners,
  type CampaignBanner,
  type CampaignBannerSettings,
} from "../db/schema.js";
import { CAMPAIGN_BANNER_CODE, hasActiveAddon } from "./addon-entitlement.js";
import { hasServiceAccessForBusiness } from "./entitlement.js";
import { broadcastKioskPayload } from "./vision-orchestrator.js";

export const MAX_BANNERS_PER_WORKSPACE = 5;
export const MIN_DURATION_SEC = 3;
export const MAX_DURATION_SEC = 30;
export const MAX_BANNER_IMAGE_BYTES = 3 * 1024 * 1024;
export const CAMPAIGN_BANNER_BUCKET = "campaign-banners";

export type CampaignBannerLayout = "top" | "right" | "bottom";

function httpError(message: string, statusCode: number): Error & { statusCode: number } {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = statusCode;
  return err;
}

function normalizeLayout(raw: string | null | undefined): CampaignBannerLayout {
  if (raw === "right" || raw === "bottom") return raw;
  return "top";
}

function parseLayout(raw: unknown): CampaignBannerLayout {
  if (raw === undefined || raw === null || raw === "") return "top";
  if (raw === "top" || raw === "right" || raw === "bottom") return raw;
  throw httpError('layout must be "top", "right", or "bottom"', 400);
}

function parseOptionalUrl(raw: unknown, field: string): string | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const value = String(raw).trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("bad protocol");
    }
    return url.toString();
  } catch {
    throw httpError(`${field} must be a valid http(s) URL`, 400);
  }
}

function parseDuration(raw: unknown, fallback = 5): number {
  if (raw === undefined || raw === null || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < MIN_DURATION_SEC || value > MAX_DURATION_SEC) {
    throw httpError(
      `duration_sec must be between ${MIN_DURATION_SEC} and ${MAX_DURATION_SEC}`,
      400,
    );
  }
  return Math.round(value);
}

function parseDate(raw: unknown, field: string, required: boolean): Date | null {
  if (raw === undefined || raw === null || raw === "") {
    if (required) throw httpError(`${field} is required`, 400);
    return null;
  }
  const date = new Date(String(raw));
  if (Number.isNaN(date.getTime())) throw httpError(`${field} must be a valid datetime`, 400);
  return date;
}

export function campaignBannerSettingsOut(settings: CampaignBannerSettings) {
  return {
    enabled: settings.enabled,
    layout: normalizeLayout(settings.layout),
    updated_at: settings.updatedAt.toISOString(),
  };
}

export function bannerOut(banner: CampaignBanner) {
  return {
    id: banner.id,
    business_id: banner.businessId,
    title: banner.title,
    image_url: banner.imageUrl || "",
    target_url: banner.targetUrl ?? null,
    qr_url: banner.qrUrl ?? null,
    duration_sec: banner.durationSec,
    display_order: banner.displayOrder,
    start_at: banner.startAt.toISOString(),
    end_at: banner.endAt?.toISOString() ?? null,
    is_active: banner.isActive,
    created_at: banner.createdAt.toISOString(),
    updated_at: banner.updatedAt.toISOString(),
  };
}

export type PublicBannerItem = {
  id: string;
  title: string;
  image_url: string;
  target_url: string | null;
  qr_url: string | null;
  duration_sec: number;
  display_order: number;
};

export type CampaignBannerPublicConfig = {
  active: boolean;
  enabled: boolean;
  layout: CampaignBannerLayout;
  items: PublicBannerItem[];
};

export async function getOrCreateCampaignBannerSettings(
  businessId: string,
): Promise<CampaignBannerSettings> {
  const [existing] = await db
    .select()
    .from(campaignBannerSettings)
    .where(eq(campaignBannerSettings.businessId, businessId))
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(campaignBannerSettings)
    .values({ businessId })
    .returning();
  return created!;
}

async function assertEntitled(businessId: string): Promise<void> {
  if (!(await hasActiveAddon(businessId, CAMPAIGN_BANNER_CODE))) {
    throw httpError("Campaign Banner add-on is not active", 403);
  }
}

export async function listScheduledBanners(businessId: string): Promise<CampaignBanner[]> {
  return db
    .select()
    .from(campaignBanners)
    .where(eq(campaignBanners.businessId, businessId))
    .orderBy(asc(campaignBanners.displayOrder), asc(campaignBanners.createdAt));
}

async function listLiveBanners(businessId: string): Promise<CampaignBanner[]> {
  const now = new Date();
  const rows = await db
    .select()
    .from(campaignBanners)
    .where(
      and(
        eq(campaignBanners.businessId, businessId),
        eq(campaignBanners.isActive, true),
        lte(campaignBanners.startAt, now),
        or(isNull(campaignBanners.endAt), gte(campaignBanners.endAt, now)),
      ),
    )
    .orderBy(asc(campaignBanners.displayOrder), asc(campaignBanners.createdAt))
    .limit(MAX_BANNERS_PER_WORKSPACE);
  return rows.filter((row) => Boolean(row.imageUrl?.trim()));
}

export async function getCampaignBannerPublicConfig(
  businessId: string,
): Promise<CampaignBannerPublicConfig> {
  const [active, settings, serviceOk] = await Promise.all([
    hasActiveAddon(businessId, CAMPAIGN_BANNER_CODE),
    getOrCreateCampaignBannerSettings(businessId),
    hasServiceAccessForBusiness(businessId),
  ]);
  const entitled = active && serviceOk;
  const layout = normalizeLayout(settings.layout);
  if (!entitled || !settings.enabled) {
    return { active: entitled, enabled: false, layout, items: [] };
  }
  const items = (await listLiveBanners(businessId)).map((banner) => ({
    id: banner.id,
    title: banner.title,
    image_url: banner.imageUrl,
    target_url: banner.targetUrl ?? null,
    qr_url: banner.qrUrl ?? null,
    duration_sec: banner.durationSec,
    display_order: banner.displayOrder,
  }));
  return { active: entitled, enabled: true, layout, items };
}

export async function broadcastCampaignBannerConfig(
  businessId: string,
  businessSlug?: string,
) {
  let slug = businessSlug;
  if (!slug) {
    const [row] = await db
      .select({ slug: businesses.slug })
      .from(businesses)
      .where(eq(businesses.id, businessId))
      .limit(1);
    slug = row?.slug;
  }
  if (!slug) return;
  const cfg = await getCampaignBannerPublicConfig(businessId);
  broadcastKioskPayload(slug, { type: "campaign_banner.config", ...cfg });
}

export async function updateCampaignBannerSettings(
  businessId: string,
  patch: { enabled?: boolean; layout?: CampaignBannerLayout },
  businessSlug?: string,
): Promise<CampaignBannerSettings> {
  await assertEntitled(businessId);
  const current = await getOrCreateCampaignBannerSettings(businessId);
  const [updated] = await db
    .update(campaignBannerSettings)
    .set({
      enabled: typeof patch.enabled === "boolean" ? patch.enabled : current.enabled,
      layout: patch.layout ? normalizeLayout(patch.layout) : current.layout,
      updatedAt: new Date(),
    })
    .where(eq(campaignBannerSettings.businessId, businessId))
    .returning();
  await broadcastCampaignBannerConfig(businessId, businessSlug);
  return updated!;
}

export async function createBanner(
  businessId: string,
  body: Record<string, unknown>,
  createdBy?: string | null,
): Promise<CampaignBanner> {
  await assertEntitled(businessId);
  const [total] = await db
    .select({ value: count() })
    .from(campaignBanners)
    .where(eq(campaignBanners.businessId, businessId));
  if ((total?.value ?? 0) >= MAX_BANNERS_PER_WORKSPACE) {
    throw httpError(`Maximum ${MAX_BANNERS_PER_WORKSPACE} banners per workspace`, 400);
  }

  const title = String(body.title ?? "").trim();
  if (!title) throw httpError("title is required", 400);

  const startAt = parseDate(body.start_at, "start_at", false) ?? new Date();
  const endAt = parseDate(body.end_at, "end_at", false);
  if (endAt && endAt.getTime() <= startAt.getTime()) {
    throw httpError("end_at must be after start_at", 400);
  }

  const existing = await listScheduledBanners(businessId);
  const nextOrder =
    existing.length === 0
      ? 0
      : Math.max(...existing.map((b) => b.displayOrder)) + 1;

  const [created] = await db
    .insert(campaignBanners)
    .values({
      id: randomUUID(),
      businessId,
      title,
      imageUrl: "",
      targetUrl: parseOptionalUrl(body.target_url, "target_url"),
      qrUrl: parseOptionalUrl(body.qr_url, "qr_url"),
      durationSec: parseDuration(body.duration_sec),
      displayOrder: typeof body.display_order === "number" ? body.display_order : nextOrder,
      startAt,
      endAt,
      isActive: body.is_active !== false,
      createdBy: createdBy ?? null,
    })
    .returning();

  await broadcastCampaignBannerConfig(businessId);
  return created!;
}

export async function updateBanner(
  businessId: string,
  bannerId: string,
  body: Record<string, unknown>,
): Promise<CampaignBanner> {
  await assertEntitled(businessId);
  const [existing] = await db
    .select()
    .from(campaignBanners)
    .where(and(eq(campaignBanners.id, bannerId), eq(campaignBanners.businessId, businessId)))
    .limit(1);
  if (!existing) throw httpError("Banner not found", 404);

  const title =
    body.title !== undefined ? String(body.title ?? "").trim() : existing.title;
  if (!title) throw httpError("title is required", 400);

  const startAt =
    body.start_at !== undefined
      ? (parseDate(body.start_at, "start_at", true) as Date)
      : existing.startAt;
  const endAt =
    body.end_at !== undefined ? parseDate(body.end_at, "end_at", false) : existing.endAt;
  if (endAt && endAt.getTime() <= startAt.getTime()) {
    throw httpError("end_at must be after start_at", 400);
  }

  const [updated] = await db
    .update(campaignBanners)
    .set({
      title,
      targetUrl:
        body.target_url !== undefined
          ? parseOptionalUrl(body.target_url, "target_url")
          : existing.targetUrl,
      qrUrl:
        body.qr_url !== undefined ? parseOptionalUrl(body.qr_url, "qr_url") : existing.qrUrl,
      durationSec:
        body.duration_sec !== undefined
          ? parseDuration(body.duration_sec, existing.durationSec)
          : existing.durationSec,
      displayOrder:
        typeof body.display_order === "number" ? body.display_order : existing.displayOrder,
      startAt,
      endAt,
      isActive: typeof body.is_active === "boolean" ? body.is_active : existing.isActive,
      updatedAt: new Date(),
    })
    .where(eq(campaignBanners.id, bannerId))
    .returning();

  await broadcastCampaignBannerConfig(businessId);
  return updated!;
}

export async function deleteBanner(businessId: string, bannerId: string): Promise<void> {
  await assertEntitled(businessId);
  const deleted = await db
    .delete(campaignBanners)
    .where(and(eq(campaignBanners.id, bannerId), eq(campaignBanners.businessId, businessId)))
    .returning({ id: campaignBanners.id });
  if (!deleted.length) throw httpError("Banner not found", 404);
  await broadcastCampaignBannerConfig(businessId);
}

export async function reorderBanners(
  businessId: string,
  orderedIds: string[],
): Promise<CampaignBanner[]> {
  await assertEntitled(businessId);
  const existing = await listScheduledBanners(businessId);
  if (orderedIds.length !== existing.length) {
    throw httpError("ordered_ids must include every banner id", 400);
  }
  const idSet = new Set(existing.map((b) => b.id));
  for (const id of orderedIds) {
    if (!idSet.has(id)) throw httpError("ordered_ids contains unknown banner", 400);
  }
  await Promise.all(
    orderedIds.map((id, index) =>
      db
        .update(campaignBanners)
        .set({ displayOrder: index, updatedAt: new Date() })
        .where(eq(campaignBanners.id, id)),
    ),
  );
  await broadcastCampaignBannerConfig(businessId);
  return listScheduledBanners(businessId);
}

export async function setBannerImageUrl(
  businessId: string,
  bannerId: string,
  imageUrl: string,
): Promise<CampaignBanner> {
  await assertEntitled(businessId);
  const [updated] = await db
    .update(campaignBanners)
    .set({ imageUrl, updatedAt: new Date() })
    .where(and(eq(campaignBanners.id, bannerId), eq(campaignBanners.businessId, businessId)))
    .returning();
  if (!updated) throw httpError("Banner not found", 404);
  await broadcastCampaignBannerConfig(businessId);
  return updated;
}

export async function trackCampaignBannerEvent(params: {
  businessId: string;
  bannerId: string;
  eventName: "campaign_banner_impression" | "campaign_banner_click";
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const [banner] = await db
    .select({ id: campaignBanners.id })
    .from(campaignBanners)
    .where(
      and(
        eq(campaignBanners.id, params.bannerId),
        eq(campaignBanners.businessId, params.businessId),
      ),
    )
    .limit(1);
  if (!banner) throw httpError("Banner not found", 404);

  await db.insert(analyticsEvents).values({
    businessId: params.businessId,
    eventName: params.eventName,
    metadataJson: JSON.stringify({
      banner_id: params.bannerId,
      ...(params.metadata ?? {}),
    }),
  });
}

/** Banner event analytics, aggregated in SQL over a bounded window (TKT-008). */
export async function getCampaignBannerAnalytics(businessId: string, days = 90) {
  await assertEntitled(businessId);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const bannerIdExpr = sql<string>`coalesce(${analyticsEvents.metadataJson}::jsonb ->> 'banner_id', '')`;
  const rows = await db
    .select({
      bannerId: bannerIdExpr,
      eventName: analyticsEvents.eventName,
      events: count(),
      lastShownAt: sql<Date | null>`max(${analyticsEvents.createdAt})`,
    })
    .from(analyticsEvents)
    .where(
      and(
        eq(analyticsEvents.businessId, businessId),
        inArray(analyticsEvents.eventName, [
          "campaign_banner_impression",
          "campaign_banner_click",
        ]),
        gte(analyticsEvents.createdAt, since),
      ),
    )
    .groupBy(bannerIdExpr, analyticsEvents.eventName);

  let impressions = 0;
  let clicks = 0;
  const perBanner = new Map<
    string,
    { impressions: number; clicks: number; last_shown_at: string | null }
  >();

  for (const row of rows) {
    const bannerId = row.bannerId;
    if (!bannerId) continue;
    const events = Number(row.events);
    const bucket = perBanner.get(bannerId) ?? {
      impressions: 0,
      clicks: 0,
      last_shown_at: null,
    };
    if (row.eventName === "campaign_banner_impression") {
      impressions += events;
      bucket.impressions += events;
      const last = row.lastShownAt ? new Date(row.lastShownAt) : null;
      if (last && !Number.isNaN(last.getTime())) {
        bucket.last_shown_at = last.toISOString();
      }
    } else if (row.eventName === "campaign_banner_click") {
      clicks += events;
      bucket.clicks += events;
    }
    perBanner.set(bannerId, bucket);
  }

  const banners = await listScheduledBanners(businessId);
  const by_banner = banners.map((banner) => {
    const stats = perBanner.get(banner.id) ?? {
      impressions: 0,
      clicks: 0,
      last_shown_at: null,
    };
    const ctr =
      stats.impressions > 0
        ? Math.round((stats.clicks / stats.impressions) * 1000) / 10
        : 0;
    return {
      banner_id: banner.id,
      title: banner.title,
      impressions: stats.impressions,
      clicks: stats.clicks,
      ctr,
      last_shown_at: stats.last_shown_at,
    };
  });

  return {
    total_impressions: impressions,
    total_clicks: clicks,
    ctr: impressions > 0 ? Math.round((clicks / impressions) * 1000) / 10 : 0,
    by_banner,
  };
}

export { parseLayout };
