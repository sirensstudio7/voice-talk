import { randomBytes } from "node:crypto";
import { and, count, desc, eq, gte, lt, sql } from "drizzle-orm";
import sharp from "sharp";
import { db } from "../db/client.js";
import {
  analyticsEvents,
  photoSessions,
  photoSettings,
  type PhotoSession,
  type PhotoSettings,
} from "../db/schema.js";
import { getPublicApiBaseUrl } from "../env.js";
import {
  createSignedDownloadUrl,
  deleteStorageObject,
  downloadFromStorage,
  PHOTO_BRANDING_BUCKET,
  PHOTO_BUCKET,
  uploadPrivateToStorage,
} from "../storage/index.js";
import {
  getOrCreatePhotoSettings,
  isPhotoMomentAvailable,
  photoSettingsOut,
} from "./addon-entitlement.js";

function httpError(message: string, statusCode: number): Error & { statusCode: number } {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = statusCode;
  return err;
}

export async function trackAnalyticsEvent(params: {
  businessId: string;
  eventName: string;
  photoSessionId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await db.insert(analyticsEvents).values({
    businessId: params.businessId,
    eventName: params.eventName,
    photoSessionId: params.photoSessionId ?? null,
    metadataJson: JSON.stringify(params.metadata ?? {}),
  });
}

export async function startPhotoSession(params: {
  businessId: string;
  orderId?: string | null;
}): Promise<PhotoSession> {
  const available = await isPhotoMomentAvailable(params.businessId);
  if (!available) {
    throw httpError("Smart Photo Moment is not available for this workspace", 403);
  }

  const [session] = await db
    .insert(photoSessions)
    .values({
      businessId: params.businessId,
      orderId: params.orderId ?? null,
      status: "started",
    })
    .returning();

  return session!;
}

function buildPhotoObjectPath(businessId: string, photoId: string, kind: "full" | "thumb"): string {
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const suffix = kind === "thumb" ? "thumb" : "full";
  return `${businessId}/${yyyy}/${mm}/${dd}/${photoId}-${suffix}.jpg`;
}

async function applyBranding(buffer: Buffer, settings: PhotoSettings): Promise<Buffer> {
  let image = sharp(buffer).rotate().jpeg({ quality: 90 });
  const meta = await image.metadata();
  const width = meta.width ?? 1280;
  const height = meta.height ?? 720;

  const composites: Array<{ input: Buffer; top: number; left: number }> = [];

  if (settings.frameUrl) {
    const frameBuf = await downloadFromStorage(PHOTO_BRANDING_BUCKET, settings.frameUrl);
    if (frameBuf) {
      const frame = await sharp(frameBuf).resize(width, height, { fit: "fill" }).png().toBuffer();
      composites.push({ input: frame, top: 0, left: 0 });
    }
  }

  if (settings.logoUrl) {
    const logoBuf = await downloadFromStorage(PHOTO_BRANDING_BUCKET, settings.logoUrl);
    if (logoBuf) {
      const logoWidth = Math.max(64, Math.round(width * 0.18));
      const logo = await sharp(logoBuf)
        .resize({ width: logoWidth, withoutEnlargement: true })
        .png()
        .toBuffer();
      composites.push({ input: logo, top: Math.round(height * 0.04), left: Math.round(width * 0.04) });
    }
  }

  if (settings.campaignText?.trim()) {
    const text = settings.campaignText.trim().slice(0, 80);
    const escaped = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
    const svg = Buffer.from(
      `<svg width="${width}" height="${Math.round(height * 0.12)}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.45)"/>
        <text x="50%" y="55%" text-anchor="middle" fill="white" font-size="${Math.round(width * 0.035)}" font-family="Arial, sans-serif">${escaped}</text>
      </svg>`,
    );
    composites.push({
      input: svg,
      top: height - Math.round(height * 0.12),
      left: 0,
    });
  }

  if (composites.length > 0) {
    image = sharp(buffer).rotate().composite(composites).jpeg({ quality: 90 });
  }

  return image.toBuffer();
}

export async function uploadPhotoSessionImage(
  sessionId: string,
  imageBuffer: Buffer,
): Promise<{ photoPath: string; thumbnailPath: string }> {
  const session = await db.query.photoSessions.findFirst({
    where: eq(photoSessions.id, sessionId),
  });
  if (!session) throw httpError("Photo session not found", 404);
  if (session.status === "completed" || session.status === "expired") {
    throw httpError("Photo session is already closed", 400);
  }

  const settings = await getOrCreatePhotoSettings(session.businessId);
  const branded = await applyBranding(imageBuffer, settings);
  const thumb = await sharp(branded)
    .resize({ width: 480, withoutEnlargement: true })
    .jpeg({ quality: 75 })
    .toBuffer();

  const photoPath = buildPhotoObjectPath(session.businessId, session.id, "full");
  const thumbnailPath = buildPhotoObjectPath(session.businessId, session.id, "thumb");

  await uploadPrivateToStorage(PHOTO_BUCKET, photoPath, branded, "image/jpeg");
  await uploadPrivateToStorage(PHOTO_BUCKET, thumbnailPath, thumb, "image/jpeg");

  await db
    .update(photoSessions)
    .set({
      photoPath,
      thumbnailPath,
      status: "captured",
    })
    .where(eq(photoSessions.id, sessionId));

  await trackAnalyticsEvent({
    businessId: session.businessId,
    eventName: "photo_capture_success",
    photoSessionId: sessionId,
  });

  return { photoPath, thumbnailPath };
}

export function buildDownloadPageUrl(token: string): string {
  const base = getPublicApiBaseUrl().replace(/\/+$/, "");
  return `${base}/public/photo/download/${encodeURIComponent(token)}?redirect=1`;
}

export async function completePhotoSession(sessionId: string): Promise<{
  qrToken: string;
  downloadUrl: string;
  expiresAt: string;
}> {
  const session = await db.query.photoSessions.findFirst({
    where: eq(photoSessions.id, sessionId),
  });
  if (!session) throw httpError("Photo session not found", 404);
  if (!session.photoPath) throw httpError("Photo has not been uploaded yet", 400);

  const settings = await getOrCreatePhotoSettings(session.businessId);
  const token = session.qrToken ?? randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + settings.qrExpiryHours * 60 * 60 * 1000);

  await db
    .update(photoSessions)
    .set({
      qrToken: token,
      downloadExpiresAt: expiresAt,
      status: "completed",
      visitorResponse: session.visitorResponse ?? "yes",
    })
    .where(eq(photoSessions.id, sessionId));

  await trackAnalyticsEvent({
    businessId: session.businessId,
    eventName: "qr_generated",
    photoSessionId: sessionId,
  });

  return {
    qrToken: token,
    downloadUrl: buildDownloadPageUrl(token),
    expiresAt: expiresAt.toISOString(),
  };
}

export async function resolvePhotoDownload(token: string): Promise<{
  url: string;
  expiresAt: string;
  businessName?: string;
}> {
  const session = await db.query.photoSessions.findFirst({
    where: eq(photoSessions.qrToken, token),
  });
  if (!session || !session.photoPath) throw httpError("Photo not found", 404);
  if (!session.downloadExpiresAt || session.downloadExpiresAt.getTime() < Date.now()) {
    throw httpError("Link expired", 410);
  }

  await trackAnalyticsEvent({
    businessId: session.businessId,
    eventName: "qr_scanned",
    photoSessionId: session.id,
  });

  const url = await createSignedDownloadUrl(PHOTO_BUCKET, session.photoPath, 600);

  if (!session.downloadedAt) {
    await db
      .update(photoSessions)
      .set({ downloadedAt: new Date() })
      .where(eq(photoSessions.id, session.id));
  }

  await trackAnalyticsEvent({
    businessId: session.businessId,
    eventName: "photo_downloaded",
    photoSessionId: session.id,
  });

  return {
    url,
    expiresAt: session.downloadExpiresAt.toISOString(),
  };
}

export async function markPhotoOfferResponse(
  sessionId: string,
  response: "yes" | "no" | "timeout",
): Promise<void> {
  const session = await db.query.photoSessions.findFirst({
    where: eq(photoSessions.id, sessionId),
  });
  if (!session) return;

  await db
    .update(photoSessions)
    .set({
      visitorResponse: response,
      status: response === "yes" ? "accepted" : "declined",
    })
    .where(eq(photoSessions.id, sessionId));

  await trackAnalyticsEvent({
    businessId: session.businessId,
    eventName: response === "yes" ? "photo_offer_accepted" : "photo_offer_declined",
    photoSessionId: sessionId,
    metadata: { response },
  });
}

export async function updatePhotoSettings(
  businessId: string,
  patch: Partial<{
    enabled: boolean;
    voicePrompt: string;
    countdownSeconds: number;
    qrExpiryHours: number;
    campaignText: string | null;
    autoDeleteDays: number;
    logoUrl: string | null;
    frameUrl: string | null;
  }>,
) {
  await getOrCreatePhotoSettings(businessId);
  const updates: Partial<PhotoSettings> & { updatedAt: Date } = { updatedAt: new Date() };
  if (patch.enabled !== undefined) updates.enabled = patch.enabled;
  if (patch.voicePrompt !== undefined) updates.voicePrompt = patch.voicePrompt.slice(0, 500);
  if (patch.countdownSeconds !== undefined) {
    updates.countdownSeconds = Math.min(10, Math.max(1, Math.round(patch.countdownSeconds)));
  }
  if (patch.qrExpiryHours !== undefined) {
    updates.qrExpiryHours = Math.min(168, Math.max(1, Math.round(patch.qrExpiryHours)));
  }
  if (patch.autoDeleteDays !== undefined) {
    updates.autoDeleteDays = Math.min(90, Math.max(1, Math.round(patch.autoDeleteDays)));
  }
  if (patch.campaignText !== undefined) {
    updates.campaignText = patch.campaignText?.slice(0, 120) ?? null;
  }
  if (patch.logoUrl !== undefined) updates.logoUrl = patch.logoUrl;
  if (patch.frameUrl !== undefined) updates.frameUrl = patch.frameUrl;

  const [updated] = await db
    .update(photoSettings)
    .set(updates)
    .where(eq(photoSettings.businessId, businessId))
    .returning();
  return photoSettingsOut(updated!);
}

export async function listPhotoGallery(params: {
  businessId: string;
  from?: Date | null;
  to?: Date | null;
  limit?: number;
  offset?: number;
}) {
  const conditions = [
    eq(photoSessions.businessId, params.businessId),
    sql`${photoSessions.photoPath} IS NOT NULL`,
  ];
  if (params.from) conditions.push(gte(photoSessions.createdAt, params.from));
  if (params.to) conditions.push(lt(photoSessions.createdAt, params.to));

  const whereClause = and(...conditions);
  const limit = params.limit ?? 50;
  const offset = params.offset ?? 0;

  const [totalRow] = await db.select({ value: count() }).from(photoSessions).where(whereClause);
  const rows = await db
    .select()
    .from(photoSessions)
    .where(whereClause)
    .orderBy(desc(photoSessions.createdAt))
    .limit(limit)
    .offset(offset);

  const items = await Promise.all(
    rows.map(async (row) => {
      let thumbnailUrl: string | null = null;
      let photoUrl: string | null = null;
      try {
        if (row.thumbnailPath) {
          thumbnailUrl = await createSignedDownloadUrl(PHOTO_BUCKET, row.thumbnailPath, 3600);
        }
        if (row.photoPath) {
          photoUrl = await createSignedDownloadUrl(PHOTO_BUCKET, row.photoPath, 3600);
        }
      } catch {
        // ignore signed url failures for listing
      }
      return {
        id: row.id,
        status: row.status,
        visitor_response: row.visitorResponse,
        created_at: row.createdAt.toISOString(),
        downloaded_at: row.downloadedAt?.toISOString() ?? null,
        download_expires_at: row.downloadExpiresAt?.toISOString() ?? null,
        thumbnail_url: thumbnailUrl,
        photo_url: photoUrl,
      };
    }),
  );

  return { items, total: totalRow?.value ?? 0, limit, offset };
}

export async function deletePhotoSession(businessId: string, sessionId: string): Promise<void> {
  const session = await db.query.photoSessions.findFirst({
    where: and(eq(photoSessions.id, sessionId), eq(photoSessions.businessId, businessId)),
  });
  if (!session) throw httpError("Photo not found", 404);

  if (session.photoPath) {
    await deleteStorageObject(PHOTO_BUCKET, session.photoPath).catch(() => undefined);
  }
  if (session.thumbnailPath) {
    await deleteStorageObject(PHOTO_BUCKET, session.thumbnailPath).catch(() => undefined);
  }

  await db.delete(photoSessions).where(eq(photoSessions.id, sessionId));
}

export async function getPhotoAnalytics(businessId: string) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(startOfToday.getFullYear(), startOfToday.getMonth(), 1);

  const [photosToday] = await db
    .select({ value: count() })
    .from(photoSessions)
    .where(
      and(
        eq(photoSessions.businessId, businessId),
        gte(photoSessions.createdAt, startOfToday),
        sql`${photoSessions.photoPath} IS NOT NULL`,
      ),
    );

  const [offers] = await db
    .select({ value: count() })
    .from(analyticsEvents)
    .where(
      and(
        eq(analyticsEvents.businessId, businessId),
        eq(analyticsEvents.eventName, "photo_offer_shown"),
        gte(analyticsEvents.createdAt, startOfMonth),
      ),
    );

  const [accepted] = await db
    .select({ value: count() })
    .from(analyticsEvents)
    .where(
      and(
        eq(analyticsEvents.businessId, businessId),
        eq(analyticsEvents.eventName, "photo_offer_accepted"),
        gte(analyticsEvents.createdAt, startOfMonth),
      ),
    );

  const [downloadsToday] = await db
    .select({ value: count() })
    .from(analyticsEvents)
    .where(
      and(
        eq(analyticsEvents.businessId, businessId),
        eq(analyticsEvents.eventName, "photo_downloaded"),
        gte(analyticsEvents.createdAt, startOfToday),
      ),
    );

  const [downloadsMonth] = await db
    .select({ value: count() })
    .from(analyticsEvents)
    .where(
      and(
        eq(analyticsEvents.businessId, businessId),
        eq(analyticsEvents.eventName, "photo_downloaded"),
        gte(analyticsEvents.createdAt, startOfMonth),
      ),
    );

  const offerCount = offers?.value ?? 0;
  const acceptCount = accepted?.value ?? 0;

  return {
    photos_today: photosToday?.value ?? 0,
    acceptance_rate: offerCount > 0 ? Math.round((acceptCount / offerCount) * 1000) / 10 : 0,
    downloads_today: downloadsToday?.value ?? 0,
    downloads_this_month: downloadsMonth?.value ?? 0,
  };
}

export async function expireQrTokens(): Promise<number> {
  const result = await db
    .update(photoSessions)
    .set({ status: "expired" })
    .where(
      and(
        eq(photoSessions.status, "completed"),
        sql`${photoSessions.downloadExpiresAt} IS NOT NULL`,
        lt(photoSessions.downloadExpiresAt, new Date()),
      ),
    )
    .returning({ id: photoSessions.id });
  return result.length;
}

export async function deleteExpiredPhotos(): Promise<number> {
  const settingsRows = await db.select().from(photoSettings);
  let deleted = 0;

  for (const settings of settingsRows) {
    const cutoff = new Date(Date.now() - settings.autoDeleteDays * 24 * 60 * 60 * 1000);
    const rows = await db
      .select()
      .from(photoSessions)
      .where(
        and(eq(photoSessions.businessId, settings.businessId), lt(photoSessions.createdAt, cutoff)),
      );

    for (const row of rows) {
      if (row.photoPath) {
        await deleteStorageObject(PHOTO_BUCKET, row.photoPath).catch(() => undefined);
      }
      if (row.thumbnailPath) {
        await deleteStorageObject(PHOTO_BUCKET, row.thumbnailPath).catch(() => undefined);
      }
      await db.delete(photoSessions).where(eq(photoSessions.id, row.id));
      deleted += 1;
    }
  }

  return deleted;
}

export { PHOTO_BRANDING_BUCKET };
