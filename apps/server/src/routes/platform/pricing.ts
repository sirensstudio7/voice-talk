import { eq } from "drizzle-orm";
import { sendAuthError } from "../../auth/jwt.js";
import { getCurrentPlatformAdmin, writeAuditLog } from "../../auth/platform-auth.js";
import { requirePermission } from "../../auth/platform-rbac.js";
import { db, withDbTimeout } from "../../db/client.js";
import { addons, plans, topupPackages } from "../../db/schema.js";
import type { Elysia } from "elysia";

export function formatAddonPriceDisplay(amountIdr: number) {
  return `Rp${amountIdr.toLocaleString("id-ID")}/month`;
}

export function parsePositiveInt(value: unknown, label: string) {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    const err = new Error(`${label} must be a whole number.`) as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }
  return n;
}

export function parsePercent(value: unknown, label: string) {
  const n = parsePositiveInt(value, label);
  if (n > 100) {
    const err = new Error(`${label} must be between 0 and 100.`) as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }
  return n;
}

export function yearlyFromMonthly(monthlyIdr: number, discountPercent: number) {
  return Math.round(monthlyIdr * 12 * (1 - discountPercent / 100));
}

export async function registerPlatformPricingRoutes(app: Elysia): Promise<void> {
  app.get("/platform/pricing", async (request) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "subscriptions:read");
      const [planRows, addonRows, packageRows] = await withDbTimeout(
        (database) =>
          Promise.all([
            database.select().from(plans),
            database.select().from(addons),
            database.select().from(topupPackages),
          ]),
        20_000,
      );
      return {
        plans: planRows
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((plan) => ({
            id: plan.id,
            code: plan.code,
            name: plan.name,
            is_trial: plan.isTrial,
            workspace_limit: plan.workspaceLimit,
            kiosk_display_limit: plan.kioskDisplayLimit,
            monthly_price_idr: plan.monthlyPriceIdr,
            yearly_price_idr: plan.yearlyPriceIdr,
            yearly_discount_percent: plan.yearlyDiscountPercent,
            monthly_voice_minutes: Math.round(plan.monthlyVoiceSeconds / 60),
          })),
        addons: addonRows
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((addon) => ({
            id: addon.id,
            code: addon.code,
            name: addon.name,
            description: addon.description,
            price_display: addon.priceDisplay,
            monthly_price_idr: addon.monthlyPriceIdr,
            discount_3m_percent: addon.discount3mPercent,
            discount_6m_percent: addon.discount6mPercent,
            discount_12m_percent: addon.discount12mPercent,
          })),
        topup_packages: packageRows
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((pkg) => ({
            id: pkg.id,
            code: pkg.code,
            name: pkg.name,
            minutes: pkg.minutes,
            price_idr: pkg.priceIdr,
            discount_percent: pkg.discountPercent,
            expires_after_days: pkg.expiresAfterDays,
            is_popular: pkg.isPopular,
            status: pkg.status,
          })),
      };
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.patch("/platform/pricing/plans/:code", async (request) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "subscriptions:write");
      const { code } = request.params as { code: string };
      const body = (request.body ?? {}) as {
        monthly_price_idr?: number;
        yearly_price_idr?: number;
        yearly_discount_percent?: number;
        monthly_voice_minutes?: number;
        workspace_limit?: number;
        kiosk_display_limit?: number;
      };
      const plan = await db.query.plans.findFirst({ where: eq(plans.code, code) });
      if (!plan) {
        return request.status(404, { detail: "Plan not found." });
      }
      const updates: Partial<typeof plans.$inferInsert> = {};
      if (body.monthly_price_idr !== undefined) {
        updates.monthlyPriceIdr = parsePositiveInt(body.monthly_price_idr, "Monthly price");
      }
      if (body.yearly_discount_percent !== undefined) {
        updates.yearlyDiscountPercent = parsePercent(body.yearly_discount_percent, "Yearly discount");
      }
      const nextMonthly = updates.monthlyPriceIdr ?? plan.monthlyPriceIdr;
      const nextDiscount = updates.yearlyDiscountPercent ?? plan.yearlyDiscountPercent;
      if (body.monthly_price_idr !== undefined || body.yearly_discount_percent !== undefined) {
        updates.yearlyPriceIdr = yearlyFromMonthly(nextMonthly, nextDiscount);
      } else if (body.yearly_price_idr !== undefined) {
        updates.yearlyPriceIdr = parsePositiveInt(body.yearly_price_idr, "Yearly price");
      }
      if (body.monthly_voice_minutes !== undefined) {
        updates.monthlyVoiceSeconds = parsePositiveInt(body.monthly_voice_minutes, "Monthly minutes") * 60;
      }
      if (body.workspace_limit !== undefined) {
        const limit = parsePositiveInt(body.workspace_limit, "Workspace limit");
        if (limit < 1) {
          return request.status(400, { detail: "Workspace limit must be at least 1." });
        }
        updates.workspaceLimit = limit;
      }
      if (body.kiosk_display_limit !== undefined) {
        const limit = parsePositiveInt(body.kiosk_display_limit, "Kiosk display limit");
        if (limit < 1) {
          return request.status(400, { detail: "Kiosk display limit must be at least 1." });
        }
        updates.kioskDisplayLimit = limit;
      }
      if (Object.keys(updates).length === 0) {
        return request.status(400, { detail: "No pricing fields to update." });
      }
      const [updated] = await db.update(plans).set(updates).where(eq(plans.id, plan.id)).returning();
      await writeAuditLog({
        adminId: admin.id,
        action: "pricing.plan.update",
        entityType: "plan",
        entityId: plan.id,
        metadata: body,
        request,
      });
      return {
        id: updated!.id,
        code: updated!.code,
        name: updated!.name,
        is_trial: updated!.isTrial,
        workspace_limit: updated!.workspaceLimit,
        kiosk_display_limit: updated!.kioskDisplayLimit,
        monthly_price_idr: updated!.monthlyPriceIdr,
        yearly_price_idr: updated!.yearlyPriceIdr,
        yearly_discount_percent: updated!.yearlyDiscountPercent,
        monthly_voice_minutes: Math.round(updated!.monthlyVoiceSeconds / 60),
      };
    } catch (err) {
      if (err instanceof Error && "statusCode" in err) {
        return request.status((err as Error & { statusCode: number }).statusCode, {
          detail: err.message,
        });
      }
      return sendAuthError(request, err);
    }
  });

  app.patch("/platform/pricing/addons/:code", async (request) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "subscriptions:write");
      const { code } = request.params as { code: string };
      const body = (request.body ?? {}) as {
        monthly_price_idr?: number;
        discount_3m_percent?: number;
        discount_6m_percent?: number;
        discount_12m_percent?: number;
      };
      const addon = await db.query.addons.findFirst({ where: eq(addons.code, code) });
      if (!addon) {
        return request.status(404, { detail: "Add-on not found." });
      }
      const updates: Partial<typeof addons.$inferInsert> = {};
      if (body.monthly_price_idr !== undefined) {
        const monthly = parsePositiveInt(body.monthly_price_idr, "Monthly price");
        updates.monthlyPriceIdr = monthly;
        updates.priceDisplay = formatAddonPriceDisplay(monthly);
      }
      if (body.discount_3m_percent !== undefined) {
        updates.discount3mPercent = parsePercent(body.discount_3m_percent, "3-month discount");
      }
      if (body.discount_6m_percent !== undefined) {
        updates.discount6mPercent = parsePercent(body.discount_6m_percent, "6-month discount");
      }
      if (body.discount_12m_percent !== undefined) {
        updates.discount12mPercent = parsePercent(body.discount_12m_percent, "12-month discount");
      }
      if (Object.keys(updates).length === 0) {
        return request.status(400, { detail: "No pricing fields to update." });
      }
      const [updated] = await db.update(addons).set(updates).where(eq(addons.id, addon.id)).returning();
      await writeAuditLog({
        adminId: admin.id,
        action: "pricing.addon.update",
        entityType: "addon",
        entityId: addon.id,
        metadata: body,
        request,
      });
      return {
        id: updated!.id,
        code: updated!.code,
        name: updated!.name,
        description: updated!.description,
        price_display: updated!.priceDisplay,
        monthly_price_idr: updated!.monthlyPriceIdr,
        discount_3m_percent: updated!.discount3mPercent,
        discount_6m_percent: updated!.discount6mPercent,
        discount_12m_percent: updated!.discount12mPercent,
      };
    } catch (err) {
      if (err instanceof Error && "statusCode" in err) {
        return request.status((err as Error & { statusCode: number }).statusCode, {
          detail: err.message,
        });
      }
      return sendAuthError(request, err);
    }
  });

  app.patch("/platform/pricing/topup-packages/:id", async (request) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "subscriptions:write");
      const { id } = request.params as { id: string };
      const body = (request.body ?? {}) as {
        price_idr?: number;
        minutes?: number;
        discount_percent?: number;
      };
      const pkg = await db.query.topupPackages.findFirst({ where: eq(topupPackages.id, id) });
      if (!pkg) {
        return request.status(404, { detail: "Top-up package not found." });
      }
      const updates: Partial<typeof topupPackages.$inferInsert> = { updatedAt: new Date() };
      if (body.price_idr !== undefined) {
        updates.priceIdr = parsePositiveInt(body.price_idr, "Price");
      }
      if (body.minutes !== undefined) {
        const minutes = parsePositiveInt(body.minutes, "Minutes");
        if (minutes < 1) {
          return request.status(400, { detail: "Minutes must be at least 1." });
        }
        updates.minutes = minutes;
      }
      if (body.discount_percent !== undefined) {
        updates.discountPercent = parsePercent(body.discount_percent, "Discount");
      }
      if (
        body.price_idr === undefined &&
        body.minutes === undefined &&
        body.discount_percent === undefined
      ) {
        return request.status(400, { detail: "No pricing fields to update." });
      }
      const [updated] = await db
        .update(topupPackages)
        .set(updates)
        .where(eq(topupPackages.id, id))
        .returning();
      await writeAuditLog({
        adminId: admin.id,
        action: "pricing.topup.update",
        entityType: "topup_package",
        entityId: id,
        metadata: body,
        request,
      });
      return {
        id: updated!.id,
        code: updated!.code,
        name: updated!.name,
        minutes: updated!.minutes,
        price_idr: updated!.priceIdr,
        discount_percent: updated!.discountPercent,
        expires_after_days: updated!.expiresAfterDays,
        is_popular: updated!.isPopular,
        status: updated!.status,
      };
    } catch (err) {
      if (err instanceof Error && "statusCode" in err) {
        return request.status((err as Error & { statusCode: number }).statusCode, {
          detail: err.message,
        });
      }
      return sendAuthError(request, err);
    }
  });
}
