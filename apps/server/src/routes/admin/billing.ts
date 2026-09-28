import { desc, eq } from "drizzle-orm";
import { getCurrentUser, requireBusinessAccess, sendAuthError } from "../../auth/jwt.js";
import { db } from "../../db/client.js";
import { addonRequests, addons, businesses, plans, subscriptionRequests, topupOrders } from "../../db/schema.js";
import { createSubscriptionRequest, getEntitlementSnapshot, listPaidPlans } from "../../services/entitlement.js";
import { ALLOWED_IMAGE_TYPES, MAX_UPLOAD_BYTES, uploadToStorage } from "../../storage/index.js";
import { createAddonRequest, getAddonStatusForBusiness, listAddonStatusesForBusiness, listAddons } from "../../services/addon-entitlement.js";
import { readUploadedFile } from "../../http/multipart.js";
import { optionalNumberLike, optionalString } from "../../http/validation.js";
import { ADDON_MONTHLY_IDR, ADDON_DURATION_DISCOUNTS } from "./shared.js";
import { t, type Elysia } from "elysia";

export const subscriptionRequestBody = t.Object({
  plan_code: optionalString,
});

export const addonRequestBody = t.Object({
  duration_months: optionalNumberLike,
  payment_method: optionalString,
  billing_name: optionalString,
  billing_email: optionalString,
  billing_phone: optionalString,
  company: optionalString,
  notes: optionalString,
  payment_proof_url: optionalString,
  transaction_code: optionalString,
  amount_display: optionalString,
  amount_idr: optionalNumberLike,
});

export /** Prefer checkout Amount in notes; otherwise derive from Duration. */
function amountLabelFromAddonNotes(notes: string): string {
  const explicit = notes.match(/Amount:\s*(.+)/i);
  if (explicit?.[1]?.trim()) return explicit[1].trim();

  const durationMatch = notes.match(/Duration:\s*(\d+)\s*month/i);
  const months = durationMatch ? Number(durationMatch[1]) : 0;
  if (!months) return "—";

  const discount = ADDON_DURATION_DISCOUNTS[months] ?? 0;
  const total = Math.round(ADDON_MONTHLY_IDR * months * (1 - discount));
  return `Rp${total.toLocaleString("id-ID")}`;
}

export async function registerAdminBillingRoutes(app: Elysia): Promise<void> {
  app.get("/admin/transactions", async (request) => {
    try {
      const user = await getCurrentUser(request);

      const [planRows, addonRows, topupRows] = await Promise.all([
        db
          .select({
            id: subscriptionRequests.id,
            status: subscriptionRequests.status,
            createdAt: subscriptionRequests.createdAt,
            reviewedAt: subscriptionRequests.reviewedAt,
            notes: subscriptionRequests.notes,
            planName: plans.name,
            planCode: plans.code,
          })
          .from(subscriptionRequests)
          .innerJoin(plans, eq(plans.id, subscriptionRequests.requestedPlanId))
          .where(eq(subscriptionRequests.userId, user.id))
          .orderBy(desc(subscriptionRequests.createdAt))
          .limit(50),
        db
          .select({
            id: addonRequests.id,
            status: addonRequests.status,
            createdAt: addonRequests.createdAt,
            reviewedAt: addonRequests.reviewedAt,
            notes: addonRequests.notes,
            paymentProofUrl: addonRequests.paymentProofUrl,
            transactionCode: addonRequests.transactionCode,
            addonName: addons.name,
            addonCode: addons.code,
            priceDisplay: addons.priceDisplay,
            businessName: businesses.name,
            businessId: businesses.id,
          })
          .from(addonRequests)
          .innerJoin(addons, eq(addons.code, addonRequests.addonCode))
          .innerJoin(businesses, eq(businesses.id, addonRequests.businessId))
          .where(eq(addonRequests.userId, user.id))
          .orderBy(desc(addonRequests.createdAt))
          .limit(50),
        db
          .select()
          .from(topupOrders)
          .where(eq(topupOrders.userId, user.id))
          .orderBy(desc(topupOrders.createdAt))
          .limit(50),
      ]);

      const items = [
        ...planRows.map((row) => ({
          id: row.id,
          type: "subscription" as const,
          title: `${row.planName} plan`,
          subtitle: row.planCode,
          status: row.status,
          amount_label: null as string | null,
          workspace_name: null as string | null,
          payment_proof_url: null as string | null,
          transaction_code: null as string | null,
          notes: row.notes,
          created_at: row.createdAt.toISOString(),
          reviewed_at: row.reviewedAt?.toISOString() ?? null,
        })),
        ...addonRows.map((row) => ({
          id: row.id,
          type: "addon" as const,
          title: row.addonName,
          subtitle: row.addonCode,
          status: row.status,
          amount_label: amountLabelFromAddonNotes(row.notes),
          workspace_name: row.businessName,
          payment_proof_url: row.paymentProofUrl,
          transaction_code: row.transactionCode,
          notes: row.notes,
          created_at: row.createdAt.toISOString(),
          reviewed_at: row.reviewedAt?.toISOString() ?? null,
        })),
        ...topupRows.map((row) => ({
          id: row.id,
          type: "topup" as const,
          title: row.packageName,
          subtitle: row.transactionCode,
          status: row.status === "paid" ? "approved" : row.status,
          amount_label: `Rp${row.priceIdr.toLocaleString("id-ID")}`,
          workspace_name: null as string | null,
          payment_proof_url: row.paymentProofUrl,
          transaction_code: row.transactionCode,
          notes: row.notes,
          created_at: row.createdAt.toISOString(),
          reviewed_at: row.paidAt?.toISOString() ?? null,
        })),
      ].sort((a, b) => b.created_at.localeCompare(a.created_at));

      return { items };
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.get("/admin/subscription/me", async (request) => {
    try {
      const user = await getCurrentUser(request);
      return getEntitlementSnapshot(user.id);
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.get("/admin/subscription/plans", async (request) => {
    try {
      await getCurrentUser(request);
      const paid = await listPaidPlans();
      return paid.map((p) => ({
        code: p.code,
        name: p.name,
        workspace_limit: p.workspaceLimit,
        kiosk_display_limit: p.kioskDisplayLimit,
        monthly_price_idr: p.monthlyPriceIdr,
        yearly_price_idr: p.yearlyPriceIdr,
        yearly_discount_percent: p.yearlyDiscountPercent,
        monthly_voice_minutes: Math.round(p.monthlyVoiceSeconds / 60),
      }));
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.post("/admin/subscription/request", async (request) => {
    try {
      const user = await getCurrentUser(request);
      const body = request.body;
      const planCode = body.plan_code?.trim().toLowerCase() ?? "";
      if (!planCode) {
        return request.status(400, { detail: "plan_code is required" });
      }

      try {
        const { requestId, plan } = await createSubscriptionRequest(user.id, planCode);
        const entitlement = await getEntitlementSnapshot(user.id);
        return request.status(201, {
          id: requestId,
          requested_plan: {
            code: plan.code,
            name: plan.name,
            workspace_limit: plan.workspaceLimit,
            kiosk_display_limit: plan.kioskDisplayLimit,
          },
          status: "pending",
          entitlement,
        });
      } catch (err) {
        if (err instanceof Error && "statusCode" in err) {
          return request.status((err as Error & { statusCode: number }).statusCode, {
            detail: err.message,
          });
        }
        throw err;
      }
    } catch (err) {
      return sendAuthError(request, err);
    }
  }, {
    body: subscriptionRequestBody,
  });

  app.get("/admin/addons", async (request) => {
    try {
      await getCurrentUser(request);
      const rows = await listAddons();
      return rows.map((a) => ({
        code: a.code,
        name: a.name,
        description: a.description,
        price_display: a.priceDisplay,
        monthly_price_idr: a.monthlyPriceIdr,
      }));
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.get("/admin/businesses/:businessId/addons", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      return listAddonStatusesForBusiness(businessId);
    } catch (err) {
      if (err instanceof Error && "statusCode" in err) {
        return request.status((err as Error & { statusCode: number }).statusCode, {
          detail: err.message,
        });
      }
      return sendAuthError(request, err);
    }
  });

  app.get("/admin/businesses/:businessId/addons/:code", async (request) => {
    try {
      const { businessId, code } = request.params as { businessId: string; code: string };
      await requireBusinessAccess(request, businessId);
      return getAddonStatusForBusiness(businessId, code);
    } catch (err) {
      if (err instanceof Error && "statusCode" in err) {
        return request.status((err as Error & { statusCode: number }).statusCode, {
          detail: err.message,
        });
      }
      return sendAuthError(request, err);
    }
  });

  app.post("/admin/businesses/:businessId/addons/payment-proof", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      const data = readUploadedFile(request.body);
      if (!data) return request.status(400, { detail: "No file uploaded." });

      const contentType = (data.mimetype || "").toLowerCase();
      const extension = ALLOWED_IMAGE_TYPES[contentType];
      if (!extension) {
        return request.status(400, {
          detail: "Upload a PNG, JPG, WEBP, or GIF image of your payment proof.",
        });
      }

      const buffer = await data.toBuffer();
      if (!buffer.length) return request.status(400, { detail: "Uploaded file is empty." });
      if (buffer.length > MAX_UPLOAD_BYTES) {
        return request.status(400, { detail: "Payment proof must be 5 MB or smaller." });
      }

      const url = await uploadToStorage(
        "payment-proofs",
        `${businessId}/proof-${Date.now()}${extension}`,
        buffer,
        contentType,
      );
      return { url };
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.post("/admin/businesses/:businessId/addons/:code/request", async (request) => {
    try {
      const user = await getCurrentUser(request);
      const { businessId, code } = request.params as { businessId: string; code: string };
      await requireBusinessAccess(request, businessId);
      const body = request.body;
      const noteParts = [
        body.amount_display
          ? `Amount: ${body.amount_display}`
          : body.amount_idr != null
            ? `Amount: Rp${Number(body.amount_idr).toLocaleString("id-ID")}`
            : null,
        body.duration_months ? `Duration: ${body.duration_months} month(s)` : null,
        body.payment_method ? `Payment method: ${body.payment_method}` : null,
        body.billing_name ? `Name: ${body.billing_name}` : null,
        body.billing_email ? `Email: ${body.billing_email}` : null,
        body.billing_phone ? `Phone: ${body.billing_phone}` : null,
        body.company ? `Company: ${body.company}` : null,
        body.notes ? `Note: ${body.notes}` : null,
        body.payment_proof_url ? `Payment proof: ${body.payment_proof_url}` : null,
      ].filter(Boolean);
      try {
        const { requestId, transactionCode, addon } = await createAddonRequest(
          user.id,
          businessId,
          code,
          noteParts.join("\n"),
          body.payment_proof_url?.trim() || null,
          body.transaction_code,
        );
        return request.status(201, {
          id: requestId,
          status: "pending",
          transaction_code: transactionCode,
          addon: {
            code: addon.code,
            name: addon.name,
            price_display: addon.priceDisplay,
          },
        });
      } catch (err) {
        if (err instanceof Error && "statusCode" in err) {
          return request.status((err as Error & { statusCode: number }).statusCode, {
            detail: err.message,
          });
        }
        throw err;
      }
    } catch (err) {
      return sendAuthError(request, err);
    }
  }, {
    body: addonRequestBody,
  });
}
