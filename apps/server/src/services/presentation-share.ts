import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";

import { env } from "../env.js";
import { db } from "../db/client.js";
import { presentations } from "../db/schema.js";
import { AI_PRESENTER_CODE, hasActiveAddon } from "./addon-entitlement.js";

export type PresentationShareRow = typeof presentations.$inferSelect;

export function presentationSharePageUrl(shareToken: string): string {
  const base = env.MERCHANT_ADMIN_URL.replace(/\/+$/, "");
  return `${base}/present/${shareToken}`;
}

/** Why a share link no longer works, if it doesn't. */
export function presentationShareGone(
  row: Pick<PresentationShareRow, "shareTokenRevokedAt" | "shareTokenExpiresAt">,
): "revoked" | "expired" | null {
  if (row.shareTokenRevokedAt) return "revoked";
  if (row.shareTokenExpiresAt && row.shareTokenExpiresAt.getTime() <= Date.now()) {
    return "expired";
  }
  return null;
}

export function presentationShareGoneDetail(reason: "revoked" | "expired"): string {
  return reason === "revoked"
    ? "This share link has been revoked by the owner."
    : "This share link has expired.";
}

export function presentationShareOut(row: PresentationShareRow) {
  return {
    share_token: row.shareToken,
    share_url: row.shareToken ? presentationSharePageUrl(row.shareToken) : null,
    created_at: row.shareTokenCreatedAt?.toISOString() ?? null,
    expires_at: row.shareTokenExpiresAt?.toISOString() ?? null,
    revoked_at: row.shareTokenRevokedAt?.toISOString() ?? null,
  };
}

export async function loadPresentationByShareToken(shareToken: string) {
  const token = shareToken.trim();
  if (!token) return null;
  return db.query.presentations.findFirst({
    where: and(eq(presentations.shareToken, token), isNull(presentations.deletedAt)),
  });
}

function mintToken(): string {
  return randomBytes(18).toString("base64url");
}

function expiryFromDays(expiresInDays?: number | null): Date | null {
  if (expiresInDays == null || !Number.isFinite(expiresInDays) || expiresInDays <= 0) {
    return null;
  }
  return new Date(Date.now() + Math.min(expiresInDays, 3650) * 24 * 60 * 60 * 1000);
}

/**
 * Issue a new token for the presentation (rotation). The previous token stops
 * resolving immediately because the column is replaced. `expiresInDays` is
 * optional; omit it for a link without expiry.
 */
export async function rotatePresentationShareToken(
  presentationId: string,
  expiresInDays?: number | null,
) {
  const row = await db.query.presentations.findFirst({
    where: and(eq(presentations.id, presentationId), isNull(presentations.deletedAt)),
  });
  if (!row) return null;

  const expiresAt = expiryFromDays(expiresInDays);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const shareToken = mintToken();
    try {
      const [updated] = await db
        .update(presentations)
        .set({
          shareToken,
          shareTokenCreatedAt: new Date(),
          shareTokenExpiresAt: expiresAt,
          shareTokenRevokedAt: null,
          updatedAt: new Date(),
        })
        .where(and(eq(presentations.id, presentationId), isNull(presentations.deletedAt)))
        .returning();
      if (updated) return updated;
    } catch {
      // Unique collision — try another token.
    }
  }
  return null;
}

/**
 * Revoke the current link. The token stays on the row (audit trail) but public
 * routes answer 410 until it is rotated or re-issued.
 */
export async function revokePresentationShareToken(presentationId: string) {
  const row = await db.query.presentations.findFirst({
    where: and(eq(presentations.id, presentationId), isNull(presentations.deletedAt)),
  });
  if (!row) return null;
  if (!row.shareToken) return row;
  const [updated] = await db
    .update(presentations)
    .set({ shareTokenRevokedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(presentations.id, presentationId), isNull(presentations.deletedAt)))
    .returning();
  return updated ?? null;
}

export async function ensurePresentationShareToken(presentationId: string) {
  const row = await db.query.presentations.findFirst({
    where: and(eq(presentations.id, presentationId), isNull(presentations.deletedAt)),
  });
  if (!row) return null;
  if (row.shareToken && !presentationShareGone(row)) return row;
  // No token yet, or the previous one was revoked/expired: issue a fresh one.
  return rotatePresentationShareToken(presentationId, null);
}

export async function assertSharedPresenterActive(businessId: string): Promise<void> {
  if (await hasActiveAddon(businessId, AI_PRESENTER_CODE)) return;
  const err = new Error("AI Presenter is not available") as Error & { statusCode: number };
  err.statusCode = 403;
  throw err;
}
