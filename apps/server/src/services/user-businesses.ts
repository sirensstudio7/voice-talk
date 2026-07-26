import { eq } from "drizzle-orm";
import { businessOut } from "../auth/jwt.js";
import { db } from "../db/client.js";
import { businessMembers, businesses } from "../db/schema.js";

export async function listBusinessesForUser(userId: string) {
  const rows = await db
    .select({ business: businesses })
    .from(businesses)
    .innerJoin(businessMembers, eq(businessMembers.businessId, businesses.id))
    .where(eq(businessMembers.userId, userId))
    .orderBy(businesses.name);

  return rows.map((row) => businessOut(row.business));
}
