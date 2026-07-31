import { and, eq, inArray } from "drizzle-orm";

import { db } from "../db/client.js";
import {
  addonRequests,
  addonSubscriptions,
  aiRules,
  analyticsEvents,
  appointments,
  businessHours,
  businessMembers,
  businesses,
  knowledgeEntries,
  orders,
  photoSessions,
  photoSettings,
  products,
  subscriptions,
  transcriptMessages,
  visionEvents,
  visionSettings,
  voiceSessions,
} from "../db/schema.js";
import { deleteFromStorage, PHOTO_BRANDING_BUCKET, PHOTO_BUCKET } from "../storage/index.js";

function forbidden(detail: string) {
  const err = new Error(detail) as Error & { statusCode: number };
  err.statusCode = 403;
  return err;
}

function notFound(detail: string) {
  const err = new Error(detail) as Error & { statusCode: number };
  err.statusCode = 404;
  return err;
}

/** Permanently delete a workspace. Caller must be an owner. */
export async function deleteBusinessAsOwner(userId: string, businessId: string): Promise<void> {
  const [membership] = await db
    .select({ role: businessMembers.role })
    .from(businessMembers)
    .where(and(eq(businessMembers.businessId, businessId), eq(businessMembers.userId, userId)))
    .limit(1);

  if (!membership) throw notFound("Workspace not found.");
  if (membership.role !== "owner") {
    throw forbidden("Only the workspace owner can delete it.");
  }

  const business = await db.query.businesses.findFirst({
    where: eq(businesses.id, businessId),
  });
  if (!business) throw notFound("Workspace not found.");

  const sessions = await db
    .select({ id: voiceSessions.id })
    .from(voiceSessions)
    .where(eq(voiceSessions.businessId, businessId));
  const sessionIds = sessions.map((s) => s.id);

  await db.delete(appointments).where(eq(appointments.businessId, businessId));
  await db.delete(orders).where(eq(orders.businessId, businessId));

  if (sessionIds.length > 0) {
    await db
      .delete(transcriptMessages)
      .where(inArray(transcriptMessages.voiceSessionId, sessionIds));
  }
  await db.delete(voiceSessions).where(eq(voiceSessions.businessId, businessId));

  await db.delete(products).where(eq(products.businessId, businessId));
  await db.delete(knowledgeEntries).where(eq(knowledgeEntries.businessId, businessId));
  await db.delete(businessHours).where(eq(businessHours.businessId, businessId));
  await db.delete(aiRules).where(eq(aiRules.businessId, businessId));
  await db.delete(visionSettings).where(eq(visionSettings.businessId, businessId));
  await db.delete(visionEvents).where(eq(visionEvents.businessId, businessId));
  await db.delete(analyticsEvents).where(eq(analyticsEvents.businessId, businessId));
  await db.delete(photoSessions).where(eq(photoSessions.businessId, businessId));
  await db.delete(photoSettings).where(eq(photoSettings.businessId, businessId));
  await db.delete(addonRequests).where(eq(addonRequests.businessId, businessId));
  await db.delete(addonSubscriptions).where(eq(addonSubscriptions.businessId, businessId));
  await db.delete(subscriptions).where(eq(subscriptions.businessId, businessId));
  await db.delete(businessMembers).where(eq(businessMembers.businessId, businessId));
  await db.delete(businesses).where(eq(businesses.id, businessId));

  await Promise.allSettled([
    deleteFromStorage("payment-qr", businessId),
    deleteFromStorage("backgrounds", businessId),
    deleteFromStorage("assistant-avatars", businessId),
    deleteFromStorage("product-images", businessId),
    deleteFromStorage(PHOTO_BUCKET, businessId),
    deleteFromStorage(PHOTO_BRANDING_BUCKET, businessId),
  ]);
}
