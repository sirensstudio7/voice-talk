import { eq } from "drizzle-orm";
import { requireBusinessAccess, sendAuthError } from "../../auth/jwt.js";
import { db } from "../../db/client.js";
import { knowledgeEntries } from "../../db/schema.js";
import { nonEmptyString, optionalNonEmptyString, optionalNumberLike, optionalString } from "../../http/validation.js";
import { t, type Elysia } from "elysia";

export const knowledgeCreateBody = t.Object({
  category: optionalString,
  title: optionalString,
  content: nonEmptyString,
  sort_order: optionalNumberLike,
});

export const knowledgeUpdateBody = t.Object({
  category: optionalString,
  title: optionalString,
  content: optionalNonEmptyString,
  sort_order: optionalNumberLike,
});

export function knowledgeOut(e: typeof knowledgeEntries.$inferSelect) {
  return {
    id: e.id,
    category: e.category,
    title: e.title ?? "",
    content: e.content,
    sort_order: e.sortOrder,
  };
}

export async function registerAdminKnowledgeRoutes(app: Elysia): Promise<void> {
  app.get("/admin/businesses/:businessId/knowledge", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      const rows = await db
        .select()
        .from(knowledgeEntries)
        .where(eq(knowledgeEntries.businessId, businessId))
        .orderBy(knowledgeEntries.sortOrder, knowledgeEntries.category);
      return rows.map(knowledgeOut);
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.post("/admin/businesses/:businessId/knowledge", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      const body = request.body;
      const [entry] = await db
        .insert(knowledgeEntries)
        .values({
          businessId,
          category: String(body.category ?? "General"),
          title: body.title !== undefined ? String(body.title).trim() || null : null,
          content: String(body.content),
          sortOrder: Number(body.sort_order ?? 0),
        })
        .returning();
      return request.status(201, knowledgeOut(entry!));
    } catch (err) {
      return sendAuthError(request, err);
    }
  }, {
    body: knowledgeCreateBody,
  });

  app.patch("/admin/businesses/:businessId/knowledge/:entryId", async (request) => {
    try {
      const { businessId, entryId } = request.params as { businessId: string; entryId: string };
      await requireBusinessAccess(request, businessId);
      const entry = await db.query.knowledgeEntries.findFirst({
        where: eq(knowledgeEntries.id, entryId),
      });
      if (!entry || entry.businessId !== businessId) {
        return request.status(404, { detail: "Knowledge entry not found" });
      }
      const body = request.body;
      const updates: Partial<typeof knowledgeEntries.$inferInsert> = {};
      if (body.category !== undefined) updates.category = String(body.category);
      if (body.title !== undefined) updates.title = String(body.title).trim() || null;
      if (body.content !== undefined) updates.content = String(body.content);
      if (body.sort_order !== undefined) updates.sortOrder = Number(body.sort_order);

      const [updated] = await db
        .update(knowledgeEntries)
        .set(updates)
        .where(eq(knowledgeEntries.id, entryId))
        .returning();
      return knowledgeOut(updated!);
    } catch (err) {
      return sendAuthError(request, err);
    }
  }, {
    body: knowledgeUpdateBody,
  });

  app.delete("/admin/businesses/:businessId/knowledge/:entryId", async (request) => {
    try {
      const { businessId, entryId } = request.params as { businessId: string; entryId: string };
      await requireBusinessAccess(request, businessId);
      const entry = await db.query.knowledgeEntries.findFirst({
        where: eq(knowledgeEntries.id, entryId),
      });
      if (!entry || entry.businessId !== businessId) {
        return request.status(404, { detail: "Knowledge entry not found" });
      }
      await db.delete(knowledgeEntries).where(eq(knowledgeEntries.id, entryId));
      return request.status(204, );
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.delete("/admin/businesses/:businessId/knowledge", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      const deleted = await db
        .delete(knowledgeEntries)
        .where(eq(knowledgeEntries.businessId, businessId))
        .returning({ id: knowledgeEntries.id });
      return { deleted: deleted.length };
    } catch (err) {
      return sendAuthError(request, err);
    }
  });
}
