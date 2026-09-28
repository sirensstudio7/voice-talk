import { normalizeVoiceGender, normalizeVoicePreset } from "@voicetalk/shared";
import { eq } from "drizzle-orm";
import { requireBusinessAccess, sendAuthError } from "../../auth/jwt.js";
import { db } from "../../db/client.js";
import { aiRules } from "../../db/schema.js";
import { buildSystemInstruction, normalizeIdleTimeoutSeconds } from "../../services/config-builder.js";
import { defaultAiRulesValues } from "../../services/onboarding.js";
import { getBusinessWithRelations } from "../../services/tenant.js";
import { ALLOWED_IMAGE_TYPES, deleteFromStorage, MAX_UPLOAD_BYTES, uploadToStorage } from "../../storage/index.js";
import { assertLanguageAllowed } from "../../services/addon-entitlement.js";
import { readUploadedFile } from "../../http/multipart.js";
import { optionalNumberLike, optionalString } from "../../http/validation.js";
import { t, type Elysia } from "elysia";
import { aiRulesOut } from "./shared.js";

export const aiRulesUpdateBody = t.Object({
  assistant_name: optionalString,
  avatar_model_path: optionalString,
  personality: optionalString,
  tone: optionalString,
  language: optionalString,
  behavioral_rules: optionalString,
  tool_instructions: optionalString,
  idle_timeout_seconds: optionalNumberLike,
  voice_preset: optionalString,
  voice_gender: optionalString,
});

export async function registerAdminAiRulesRoutes(app: Elysia): Promise<void> {
  app.get("/admin/businesses/:businessId/ai-rules", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      const business = await requireBusinessAccess(request, businessId);
      let rules = await db.query.aiRules.findFirst({ where: eq(aiRules.businessId, businessId) });
      if (!rules) {
        [rules] = await db
          .insert(aiRules)
          .values(
            defaultAiRulesValues({
              businessId,
              businessName: business.name,
              language: "en",
              primaryUseCase: business.primaryUseCase,
              businessType: business.businessType,
            }),
          )
          .returning();
      }
      return aiRulesOut(rules!);
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.patch("/admin/businesses/:businessId/ai-rules", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      const business = await requireBusinessAccess(request, businessId);
      let rules = await db.query.aiRules.findFirst({ where: eq(aiRules.businessId, businessId) });
      if (!rules) {
        [rules] = await db
          .insert(aiRules)
          .values(
            defaultAiRulesValues({
              businessId,
              businessName: business.name,
              language: "en",
              primaryUseCase: business.primaryUseCase,
              businessType: business.businessType,
            }),
          )
          .returning();
      }
      const body = request.body;
      const updates: Partial<typeof aiRules.$inferInsert> = {};
      if (body.assistant_name !== undefined) updates.assistantName = String(body.assistant_name);
      if (body.avatar_model_path !== undefined) {
        updates.avatarModelPath = String(body.avatar_model_path);
      }
      if (body.personality !== undefined) updates.personality = String(body.personality);
      if (body.tone !== undefined) updates.tone = String(body.tone);
      if (body.language !== undefined) {
        updates.language = await assertLanguageAllowed(businessId, String(body.language));
      }
      if (body.behavioral_rules !== undefined) updates.behavioralRules = String(body.behavioral_rules);
      if (body.tool_instructions !== undefined) updates.toolInstructions = String(body.tool_instructions);
      if (body.idle_timeout_seconds !== undefined) {
        updates.idleTimeoutSeconds = normalizeIdleTimeoutSeconds(body.idle_timeout_seconds);
      }
      if (body.voice_preset !== undefined) {
        updates.voicePreset = normalizeVoicePreset(body.voice_preset);
      }
      if (body.voice_gender !== undefined) {
        updates.voiceGender = normalizeVoiceGender(body.voice_gender);
      }

      const [updated] = await db
        .update(aiRules)
        .set(updates)
        .where(eq(aiRules.id, rules!.id))
        .returning();
      return aiRulesOut(updated!);
    } catch (err) {
      return sendAuthError(request, err);
    }
  }, {
    body: aiRulesUpdateBody,
  });

  app.post("/admin/businesses/:businessId/ai-rules/avatar", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      const business = await requireBusinessAccess(request, businessId);
      const data = readUploadedFile(request.body);
      if (!data) return request.status(400, { detail: "No file uploaded." });

      const contentType = (data.mimetype || "").toLowerCase();
      const extension = ALLOWED_IMAGE_TYPES[contentType];
      if (!extension) {
        return request.status(400, {
          detail: "Upload a PNG, JPG, WEBP, or GIF image for the assistant avatar.",
        });
      }

      const buffer = await data.toBuffer();
      if (!buffer.length) return request.status(400, { detail: "Uploaded file is empty." });
      if (buffer.length > MAX_UPLOAD_BYTES) {
        return request.status(400, { detail: "Avatar image must be 5 MB or smaller." });
      }

      let rules = await db.query.aiRules.findFirst({ where: eq(aiRules.businessId, businessId) });
      if (!rules) {
        [rules] = await db
          .insert(aiRules)
          .values(
            defaultAiRulesValues({
              businessId,
              businessName: business.name,
              language: "en",
              primaryUseCase: business.primaryUseCase,
              businessType: business.businessType,
            }),
          )
          .returning();
      }

      await deleteFromStorage("assistant-avatars", business.id);
      const url = await uploadToStorage(
        "assistant-avatars",
        `${business.id}/avatar-${Date.now()}${extension}`,
        buffer,
        contentType,
      );

      const [updated] = await db
        .update(aiRules)
        .set({ avatarUrl: url })
        .where(eq(aiRules.id, rules!.id))
        .returning();
      return aiRulesOut(updated!);
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.delete("/admin/businesses/:businessId/ai-rules/avatar", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      const business = await requireBusinessAccess(request, businessId);
      const rules = await db.query.aiRules.findFirst({ where: eq(aiRules.businessId, businessId) });
      if (!rules) {
        return request.status(404, { detail: "AI rules not found." });
      }

      await deleteFromStorage("assistant-avatars", business.id);
      const [updated] = await db
        .update(aiRules)
        .set({ avatarUrl: "" })
        .where(eq(aiRules.id, rules.id))
        .returning();
      return aiRulesOut(updated!);
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.get("/admin/businesses/:businessId/prompt-preview", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      const business = await getBusinessWithRelations(businessId);
      if (!business) return request.status(404, { detail: "Business not found" });
      return { system_instruction: buildSystemInstruction(business) };
    } catch (err) {
      return sendAuthError(request, err);
    }
  });
}
