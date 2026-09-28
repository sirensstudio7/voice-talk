import type { Elysia } from "elysia";
import { registerAdminAuthRoutes } from "./admin/auth.js";
import { registerAdminBusinessRoutes } from "./admin/businesses.js";
import { registerAdminAppearanceRoutes } from "./admin/appearance.js";
import { registerAdminProductRoutes } from "./admin/products.js";
import { registerAdminKnowledgeRoutes } from "./admin/knowledge.js";
import { registerAdminAiRulesRoutes } from "./admin/ai-rules.js";
import { registerAdminConversationRoutes } from "./admin/conversations.js";
import { registerAdminStatsRoutes } from "./admin/stats.js";
import { registerAdminBookingRoutes } from "./admin/booking.js";
import { registerAdminVisionRoutes } from "./admin/vision.js";
import { registerAdminBillingRoutes } from "./admin/billing.js";
import { registerAdminPhotoRoutes } from "./admin/photo.js";
import { registerAdminVoiceMinuteRoutes } from "./admin/voice-minutes.js";
import { registerAdminKioskRoutes } from "./admin/kiosks.js";

/** Admin API, split by domain; registration order matches the original file. */
export async function registerAdminRoutes(app: Elysia): Promise<void> {
  registerAdminAuthRoutes(app);
  registerAdminBusinessRoutes(app);
  registerAdminAppearanceRoutes(app);
  registerAdminProductRoutes(app);
  registerAdminKnowledgeRoutes(app);
  registerAdminAiRulesRoutes(app);
  registerAdminConversationRoutes(app);
  registerAdminStatsRoutes(app);
  registerAdminBookingRoutes(app);
  registerAdminVisionRoutes(app);
  registerAdminBillingRoutes(app);
  registerAdminPhotoRoutes(app);
  registerAdminVoiceMinuteRoutes(app);
  registerAdminKioskRoutes(app);
}
