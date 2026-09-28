import { and, eq, inArray } from "drizzle-orm";
import { businessOut } from "../auth/jwt.js";
import { db as defaultDb, type AppDb } from "../db/client.js";
import { addonSubscriptions, businessMembers, businesses } from "../db/schema.js";
import { BOOKING_CODE } from "./addon-entitlement.js";

async function activeBookingBusinessIds(database: AppDb, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const now = new Date();
  const subs = await database
    .select({
      businessId: addonSubscriptions.businessId,
      endsAt: addonSubscriptions.endsAt,
    })
    .from(addonSubscriptions)
    .where(
      and(
        inArray(addonSubscriptions.businessId, ids),
        eq(addonSubscriptions.addonCode, BOOKING_CODE),
        eq(addonSubscriptions.status, "active"),
      ),
    );
  return new Set(
    subs
      .filter((row) => !row.endsAt || row.endsAt.getTime() >= now.getTime())
      .map((row) => row.businessId),
  );
}

export async function listBusinessesForUser(userId: string, database: AppDb = defaultDb) {
  const rows = await database
    .select({ business: businesses })
    .from(businesses)
    .innerJoin(businessMembers, eq(businessMembers.businessId, businesses.id))
    .where(eq(businessMembers.userId, userId))
    .orderBy(businesses.name);

  const bookingActive = await activeBookingBusinessIds(
    database,
    rows.map((row) => row.business.id),
  );

  return rows.map((row) =>
    businessOut(row.business, { bookingAddonActive: bookingActive.has(row.business.id) }),
  );
}
