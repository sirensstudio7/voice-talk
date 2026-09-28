import { ensurePlatformAdminSeed } from "../auth/platform-auth.js";
import type { Elysia } from "elysia";
import { registerPlatformAuthRoutes } from "./platform/auth.js";
import { registerPlatformDashboardRoutes } from "./platform/dashboard.js";
import { registerPlatformUserRoutes } from "./platform/users.js";
import { registerPlatformBusinessRoutes } from "./platform/businesses.js";
import { registerPlatformVisionRoutes } from "./platform/vision.js";
import { registerPlatformSubscriptionRoutes } from "./platform/subscriptions.js";
import { registerPlatformSettingsRoutes } from "./platform/settings.js";
import { registerPlatformDemoRequestRoutes } from "./platform/demo-requests.js";
import { registerPlatformAuditLogRoutes } from "./platform/audit-logs.js";
import { registerPlatformSubscriptionRequestRoutes } from "./platform/subscription-requests.js";
import { registerPlatformAddonRequestRoutes } from "./platform/addon-requests.js";
import { registerPlatformTopupOrderRoutes } from "./platform/topup-orders.js";
import { registerPlatformVoiceMinuteRoutes } from "./platform/voice-minutes.js";
import { registerPlatformPricingRoutes } from "./platform/pricing.js";

/** Platform (super-admin) API, split by domain; registration order matches the original file. */
export async function registerPlatformRoutes(app: Elysia): Promise<void> {
  try {
    await ensurePlatformAdminSeed();
  } catch (error) {
    console.warn(
      "[auth] platform admin seed skipped:",
      error instanceof Error ? error.message : error,
    );
  }

  registerPlatformAuthRoutes(app);
  registerPlatformDashboardRoutes(app);
  registerPlatformUserRoutes(app);
  registerPlatformBusinessRoutes(app);
  registerPlatformVisionRoutes(app);
  registerPlatformSubscriptionRoutes(app);
  registerPlatformSettingsRoutes(app);
  registerPlatformDemoRequestRoutes(app);
  registerPlatformAuditLogRoutes(app);
  registerPlatformSubscriptionRequestRoutes(app);
  registerPlatformAddonRequestRoutes(app);
  registerPlatformTopupOrderRoutes(app);
  registerPlatformVoiceMinuteRoutes(app);
  registerPlatformPricingRoutes(app);
}
