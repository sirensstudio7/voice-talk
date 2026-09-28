import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";

import { env } from "../env.js";
import { db } from "../db/client.js";
import { presentations } from "../db/schema.js";
import { AI_PRESENTER_CODE, hasActiveAddon } from "./addon-entitlement.js";

export function presentationSharePageUrl(shareToken: string): string {
  const base = env.MERCHANT_ADMIN_URL.replace(/\/+$/, "");
  return `${base}/present/${shareToken}`;
}

export async function loadPresentationByShareToken(shareToken: string) {
  const token = shareToken.trim();
  if (!token) return null;
  return db.query.presentations.findFirst({
    where: and(eq(presentations.shareToken, token), isNull(presentations.deletedAt)),
  });
}

export async function ensurePresentationShareToken(presentationId: string) {
  const row = await db.query.presentations.findFirst({
    where: and(eq(presentations.id, presentationId), isNull(presentations.deletedAt)),
  });
  if (!row) return null;
  if (row.shareToken) return row;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const shareToken = randomBytes(18).toString("base64url");
    try {
      const [updated] = await db
        .update(presentations)
        .set({ shareToken, updatedAt: new Date() })
        .where(and(eq(presentations.id, presentationId), isNull(presentations.deletedAt)))
        .returning();
      if (updated) return updated;
    } catch {
      // Unique collision — try another token.
    }
  }
  return null;
}

export async function assertSharedPresenterActive(businessId: string): Promise<void> {
  if (await hasActiveAddon(businessId, AI_PRESENTER_CODE)) return;
  const err = new Error("AI Presenter is not available") as Error & { statusCode: number };
  err.statusCode = 403;
  throw err;
}
