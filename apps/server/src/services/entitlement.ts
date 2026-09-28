import { and, count, eq, ne } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  accountSubscriptions,
  businessMembers,
  plans,
  subscriptionRequests,
  subscriptions,
  type AccountSubscription,
  type Plan,
} from "../db/schema.js";

export const TRIAL_DURATION_MS = 48 * 60 * 60 * 1000;

export type EntitlementStatus = "trialing" | "expired" | "active" | "past_due" | "cancelled";

export type EntitlementSnapshot = {
  id: string;
  status: EntitlementStatus;
  plan_code: string;
  plan_name: string;
  workspace_limit: number;
  workspace_count: number;
  kiosk_display_limit: number;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  starts_at: string | null;
  ends_at: string | null;
  service_access: boolean;
  can_create_workspace: boolean;
  pending_request: {
    id: string;
    requested_plan_code: string;
    requested_plan_name: string;
    created_at: string;
  } | null;
};

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

export async function getPlanByCode(code: string): Promise<Plan | null> {
  return (
    (await db.query.plans.findFirst({
      where: eq(plans.code, code),
    })) ?? null
  );
}

export async function listPaidPlans(): Promise<Plan[]> {
  const rows = await db.select().from(plans).where(eq(plans.isTrial, false));
  return rows.sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function countOwnerWorkspaces(userId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(businessMembers)
    .where(and(eq(businessMembers.userId, userId), eq(businessMembers.role, "owner")));
  return row?.value ?? 0;
}

/** Create a 48h trial entitlement if the user has none. */
export async function ensureTrialEntitlement(userId: string): Promise<AccountSubscription> {
  const existing = await db.query.accountSubscriptions.findFirst({
    where: eq(accountSubscriptions.userId, userId),
  });
  if (existing) return existing;

  const trialPlan = await getPlanByCode("trial");
  if (!trialPlan) {
    throw new Error("Trial plan is not seeded");
  }

  const now = new Date();
  const [created] = await db
    .insert(accountSubscriptions)
    .values({
      userId,
      planId: trialPlan.id,
      status: "trialing",
      trialStartedAt: now,
      trialEndsAt: new Date(now.getTime() + TRIAL_DURATION_MS),
      workspaceLimit: trialPlan.workspaceLimit,
    })
    .returning();
  try {
    const { ensurePeriodGrant } = await import("./voice-minutes.js");
    await ensurePeriodGrant(userId);
  } catch {
    // Minute tables may not be migrated yet.
  }
  return created!;
}

/**
 * Existing accounts without an entitlement row get active Starter so we do not
 * lock out pre-trial customers. Prefer ensureTrialEntitlement for new signups.
 */
export async function ensureEntitlementForExistingUser(
  userId: string,
): Promise<AccountSubscription> {
  const existing = await db.query.accountSubscriptions.findFirst({
    where: eq(accountSubscriptions.userId, userId),
  });
  if (existing) return existing;

  const starter = await getPlanByCode("starter");
  if (!starter) {
    throw new Error("Starter plan is not seeded");
  }

  const now = new Date();
  const [created] = await db
    .insert(accountSubscriptions)
    .values({
      userId,
      planId: starter.id,
      status: "active",
      startsAt: now,
      workspaceLimit: starter.workspaceLimit,
    })
    .returning();
  try {
    const { ensurePeriodGrant } = await import("./voice-minutes.js");
    await ensurePeriodGrant(userId);
  } catch {
    // Minute tables may not be migrated yet.
  }
  return created!;
}

/** Lazy expiry: flip trialing → expired and active → past_due when clocks pass. */
export async function refreshEntitlementStatus(
  row: AccountSubscription,
): Promise<AccountSubscription> {
  const now = Date.now();
  let nextStatus = row.status as EntitlementStatus;
  let changed = false;

  if (row.status === "trialing" && row.trialEndsAt && row.trialEndsAt.getTime() <= now) {
    nextStatus = "expired";
    changed = true;
  } else if (row.status === "active" && row.endsAt && row.endsAt.getTime() <= now) {
    nextStatus = "past_due";
    changed = true;
  }

  if (!changed) return row;

  const [updated] = await db
    .update(accountSubscriptions)
    .set({ status: nextStatus, updatedAt: new Date() })
    .where(eq(accountSubscriptions.id, row.id))
    .returning();
  return updated!;
}

export function hasServiceAccess(status: EntitlementStatus): boolean {
  return status === "trialing" || status === "active";
}

export async function getEntitlementSnapshot(userId: string): Promise<EntitlementSnapshot> {
  let row = await db.query.accountSubscriptions.findFirst({
    where: eq(accountSubscriptions.userId, userId),
  });
  if (!row) {
    row = await ensureEntitlementForExistingUser(userId);
  }
  row = await refreshEntitlementStatus(row);

  const plan = await db.query.plans.findFirst({ where: eq(plans.id, row.planId) });
  const workspaceCount = await countOwnerWorkspaces(userId);
  const status = row.status as EntitlementStatus;
  const serviceAccess = hasServiceAccess(status);
  const underLimit = workspaceCount < row.workspaceLimit;

  const pending = await db.query.subscriptionRequests.findFirst({
    where: and(
      eq(subscriptionRequests.userId, userId),
      eq(subscriptionRequests.status, "pending"),
    ),
  });

  let pendingPayload: EntitlementSnapshot["pending_request"] = null;
  if (pending) {
    const requestedPlan = await db.query.plans.findFirst({
      where: eq(plans.id, pending.requestedPlanId),
    });
    pendingPayload = {
      id: pending.id,
      requested_plan_code: requestedPlan?.code ?? "",
      requested_plan_name: requestedPlan?.name ?? "",
      created_at: pending.createdAt.toISOString(),
    };
  }

  return {
    id: row.id,
    status,
    plan_code: plan?.code ?? "unknown",
    plan_name: plan?.name ?? "Unknown",
    workspace_limit: row.workspaceLimit,
    workspace_count: workspaceCount,
    kiosk_display_limit: Math.max(1, plan?.kioskDisplayLimit ?? 1),
    trial_started_at: toIso(row.trialStartedAt),
    trial_ends_at: toIso(row.trialEndsAt),
    starts_at: toIso(row.startsAt),
    ends_at: toIso(row.endsAt),
    service_access: serviceAccess,
    can_create_workspace: serviceAccess && underLimit,
    pending_request: pendingPayload,
  };
}

export async function assertCanCreateWorkspace(userId: string): Promise<EntitlementSnapshot> {
  const snap = await getEntitlementSnapshot(userId);
  if (!snap.service_access) {
    const err = new Error(
      snap.pending_request
        ? "Your plan is awaiting activation. Service access is paused until a package is activated."
        : "Your demo has expired. Choose a plan to continue creating workspaces.",
    ) as Error & { statusCode: number };
    err.statusCode = 403;
    throw err;
  }
  if (!snap.can_create_workspace) {
    const err = new Error(
      `Workspace limit reached (${snap.workspace_count}/${snap.workspace_limit}). Upgrade your plan to add more.`,
    ) as Error & { statusCode: number };
    err.statusCode = 403;
    throw err;
  }
  return snap;
}

export async function assertServiceAccessForUser(userId: string): Promise<EntitlementSnapshot> {
  const snap = await getEntitlementSnapshot(userId);
  if (!snap.service_access) {
    const err = new Error(
      snap.pending_request
        ? "Service access is paused while your plan request is pending activation."
        : "Service access is unavailable. Choose a plan or wait for activation.",
    ) as Error & { statusCode: number };
    err.statusCode = 403;
    throw err;
  }
  return snap;
}

/** Resolve business owner and check account entitlement for public voice access. */
export async function assertServiceAccessForBusiness(
  businessId: string,
): Promise<EntitlementSnapshot | null> {
  const owner = await db.query.businessMembers.findFirst({
    where: and(eq(businessMembers.businessId, businessId), eq(businessMembers.role, "owner")),
  });
  if (!owner) return null;
  return assertServiceAccessForUser(owner.userId);
}

/** Non-throwing check for public tenant resolution. Missing owner = allow (legacy). */
export async function hasServiceAccessForBusiness(businessId: string): Promise<boolean> {
  const owner = await db.query.businessMembers.findFirst({
    where: and(eq(businessMembers.businessId, businessId), eq(businessMembers.role, "owner")),
  });
  if (!owner) return true;
  const snap = await getEntitlementSnapshot(owner.userId);
  return snap.service_access;
}

export async function createSubscriptionRequest(
  userId: string,
  planCode: string,
): Promise<{ requestId: string; plan: Plan }> {
  const plan = await getPlanByCode(planCode);
  if (!plan || plan.isTrial) {
    const err = new Error("Invalid plan selection.") as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }

  const existingPending = await db.query.subscriptionRequests.findFirst({
    where: and(
      eq(subscriptionRequests.userId, userId),
      eq(subscriptionRequests.status, "pending"),
    ),
  });
  if (existingPending) {
    // Replace pending request with the latest selection
    const [updated] = await db
      .update(subscriptionRequests)
      .set({ requestedPlanId: plan.id, notes: "" })
      .where(eq(subscriptionRequests.id, existingPending.id))
      .returning();
    return { requestId: updated!.id, plan };
  }

  const [created] = await db
    .insert(subscriptionRequests)
    .values({
      userId,
      requestedPlanId: plan.id,
      status: "pending",
    })
    .returning();

  return { requestId: created!.id, plan };
}

export async function activateSubscriptionRequest(opts: {
  requestId: string;
  adminId: string;
  planCode?: string;
  durationMonths?: number | null;
  customEndsAt?: Date | null;
  notes?: string;
}): Promise<EntitlementSnapshot> {
  const request = await db.query.subscriptionRequests.findFirst({
    where: eq(subscriptionRequests.id, opts.requestId),
  });
  if (!request) {
    const err = new Error("Subscription request not found") as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }
  if (request.status !== "pending") {
    const err = new Error("Request is not pending") as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }

  const requestedPlan = await db.query.plans.findFirst({
    where: eq(plans.id, request.requestedPlanId),
  });
  const planCode = opts.planCode ?? requestedPlan?.code;
  if (!planCode) {
    const err = new Error("Plan is required") as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }
  const plan = await getPlanByCode(planCode);
  if (!plan || plan.isTrial) {
    const err = new Error("Invalid activation plan") as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }

  const now = new Date();
  let endsAt: Date | null = null;
  if (opts.customEndsAt) {
    endsAt = opts.customEndsAt;
  } else if (opts.durationMonths && opts.durationMonths > 0) {
    endsAt = new Date(now);
    endsAt.setMonth(endsAt.getMonth() + opts.durationMonths);
  } else {
    // Default 12 months when duration omitted
    endsAt = new Date(now);
    endsAt.setMonth(endsAt.getMonth() + 12);
  }

  let entitlement = await db.query.accountSubscriptions.findFirst({
    where: eq(accountSubscriptions.userId, request.userId),
  });
  if (!entitlement) {
    entitlement = await ensureTrialEntitlement(request.userId);
  }

  await db
    .update(accountSubscriptions)
    .set({
      planId: plan.id,
      status: "active",
      startsAt: now,
      endsAt,
      workspaceLimit: plan.workspaceLimit,
      updatedAt: now,
    })
    .where(eq(accountSubscriptions.id, entitlement.id));

  await db
    .update(subscriptionRequests)
    .set({
      status: "approved",
      reviewedAt: now,
      reviewedBy: opts.adminId,
      notes: opts.notes ?? "",
      requestedPlanId: plan.id,
    })
    .where(eq(subscriptionRequests.id, request.id));

  // Reject any other pending requests for this user
  await db
    .update(subscriptionRequests)
    .set({
      status: "rejected",
      reviewedAt: now,
      reviewedBy: opts.adminId,
      notes: "Superseded by another activation",
    })
    .where(
      and(
        eq(subscriptionRequests.userId, request.userId),
        eq(subscriptionRequests.status, "pending"),
        ne(subscriptionRequests.id, request.id),
      ),
    );

  // Sync per-business subscription rows for owner workspaces (display compatibility)
  const owned = await db
    .select({ businessId: businessMembers.businessId })
    .from(businessMembers)
    .where(and(eq(businessMembers.userId, request.userId), eq(businessMembers.role, "owner")));

  for (const { businessId } of owned) {
    const existing = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.businessId, businessId),
    });
    if (existing) {
      await db
        .update(subscriptions)
        .set({
          planName: plan.code,
          status: "active",
          startDate: now,
          endDate: endsAt,
          updatedAt: now,
        })
        .where(eq(subscriptions.id, existing.id));
    } else {
      await db.insert(subscriptions).values({
        businessId,
        planName: plan.code,
        billingCycle: "yearly",
        status: "active",
        startDate: now,
        endDate: endsAt,
      });
    }
  }

  try {
    const { ensurePeriodGrant } = await import("./voice-minutes.js");
    await ensurePeriodGrant(request.userId);
  } catch {
    // Minute tables may not be migrated yet.
  }

  return getEntitlementSnapshot(request.userId);
}

export async function rejectSubscriptionRequest(opts: {
  requestId: string;
  adminId: string;
  notes?: string;
}): Promise<void> {
  const request = await db.query.subscriptionRequests.findFirst({
    where: eq(subscriptionRequests.id, opts.requestId),
  });
  if (!request) {
    const err = new Error("Subscription request not found") as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }
  if (request.status !== "pending") {
    const err = new Error("Request is not pending") as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }

  await db
    .update(subscriptionRequests)
    .set({
      status: "rejected",
      reviewedAt: new Date(),
      reviewedBy: opts.adminId,
      notes: opts.notes ?? "",
    })
    .where(eq(subscriptionRequests.id, request.id));
}
