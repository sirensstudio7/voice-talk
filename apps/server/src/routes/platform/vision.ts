import { and, count, desc, eq, ilike, isNull, or } from "drizzle-orm";
import { sendAuthError } from "../../auth/jwt.js";
import { getCurrentPlatformAdmin } from "../../auth/platform-auth.js";
import { requirePermission } from "../../auth/platform-rbac.js";
import { db } from "../../db/client.js";
import { businesses, visionSettings } from "../../db/schema.js";
import { normalizeGreetingTriggerMode, normalizeVisionSource, VISION_SOURCES } from "../../services/vision-settings.js";
import { listQueryFields, optionalString } from "../../http/validation.js";
import { t, type Elysia } from "elysia";
import { parsePagination } from "./shared.js";

export async function registerPlatformVisionRoutes(app: Elysia): Promise<void> {
  app.get("/platform/vision", async (request) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "businesses:read");

      const query = request.query;
      const { page, limit, offset } = parsePagination(query);
      const search = query.search?.trim() ?? "";
      const sourceFilter = query.vision_source?.trim().toLowerCase() ?? "";

      const conditions = [];
      if (search) {
        conditions.push(
          or(ilike(businesses.name, `%${search}%`), ilike(businesses.slug, `%${search}%`))!,
        );
      }
      if (sourceFilter === "auto") {
        // Retired "python" rows are browser-first now, so surface them as auto.
        conditions.push(
          or(
            isNull(visionSettings.visionSource),
            eq(visionSettings.visionSource, "auto"),
            eq(visionSettings.visionSource, "python"),
          )!,
        );
      } else if (
        sourceFilter === "browser" ||
        sourceFilter === "human"
      ) {
        conditions.push(eq(visionSettings.visionSource, sourceFilter));
      }
      const whereClause = conditions.length ? and(...conditions) : undefined;

      const [totalRow] = await db
        .select({ value: count() })
        .from(businesses)
        .leftJoin(visionSettings, eq(visionSettings.businessId, businesses.id))
        .where(whereClause);

      const rows = await db
        .select({
          id: businesses.id,
          name: businesses.name,
          slug: businesses.slug,
          isActive: businesses.isActive,
          cameraTriggerEnabled: visionSettings.cameraTriggerEnabled,
          visionSource: visionSettings.visionSource,
          greetingTriggerMode: visionSettings.greetingTriggerMode,
          updatedAt: visionSettings.updatedAt,
        })
        .from(businesses)
        .leftJoin(visionSettings, eq(visionSettings.businessId, businesses.id))
        .where(whereClause)
        .orderBy(desc(businesses.createdAt))
        .limit(limit)
        .offset(offset);

      return {
        items: rows.map((r) => ({
          id: r.id,
          name: r.name,
          slug: r.slug,
          status: r.isActive ? "active" : "disabled",
          camera_trigger_enabled: r.cameraTriggerEnabled ?? false,
          vision_source: normalizeVisionSource(r.visionSource ?? "auto"),
          greeting_trigger_mode: normalizeGreetingTriggerMode(r.greetingTriggerMode ?? "presence"),
          updated_at: r.updatedAt ? r.updatedAt.toISOString() : null,
        })),
        total: totalRow?.value ?? 0,
        page,
        limit,
        sources: VISION_SOURCES,
      };
    } catch (err) {
      return sendAuthError(request, err);
    }
  }, {
    query: t.Object({
      ...listQueryFields,
      vision_source: optionalString,
    }),
  });
}
