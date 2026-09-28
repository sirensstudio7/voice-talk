import { sendAuthError } from "../../auth/jwt.js";
import { getCurrentPlatformAdmin, writeAuditLog } from "../../auth/platform-auth.js";
import { requirePermission } from "../../auth/platform-rbac.js";
import { db } from "../../db/client.js";
import { platformSettings } from "../../db/schema.js";
import type { Elysia } from "elysia";
import { ProviderApiKey, parseProviderApiKeys, withLegacyProviderKeys, redactSettings, getSettingsMap } from "./shared.js";

export const SECRET_SETTING_KEYS = new Set([
  "elevenlabs_api_key",
  "custom_voice_api_key",
  "provider_api_keys",
]);

export function looksLikeMaskedSecret(value: string): boolean {
  return /^•+/.test(value.trim());
}

export function mergeProviderApiKeys(incomingRaw: string, existing: ProviderApiKey[]): ProviderApiKey[] {
  const existingById = new Map(existing.map((item) => [item.id, item]));
  return parseProviderApiKeys(incomingRaw)
    .map((row) => {
      const previous = existingById.get(row.id);
      const nextKey = looksLikeMaskedSecret(row.key) ? (previous?.key ?? "") : row.key.trim();
      return {
        id: row.id,
        provider: row.provider,
        label: row.label,
        key: nextKey,
      };
    })
    .filter((row) => row.provider && (row.key || row.label));
}

export async function getPublicSettingsMap(): Promise<Record<string, string>> {
  return redactSettings(await getSettingsMap());
}

export async function registerPlatformSettingsRoutes(app: Elysia): Promise<void> {
  app.get("/platform/settings", async (request) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "dashboard");
      return await getPublicSettingsMap();
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.patch("/platform/settings", async (request) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "settings:write");
      const body = request.body as Record<string, string>;
      if (!body || typeof body !== "object") {
        return request.status(400, { detail: "Expected settings object" });
      }

      const current = await getSettingsMap();
      const auditMeta: Record<string, string> = {};
      for (const [key, rawValue] of Object.entries(body)) {
        if (typeof rawValue !== "string") continue;
        if (key.endsWith("_set")) continue;
        let value = rawValue;
        if (key === "provider_api_keys") {
          const merged = mergeProviderApiKeys(value, withLegacyProviderKeys(current));
          value = JSON.stringify(merged);
          const eleven = merged.find((item) => item.provider === "elevenlabs");
          const custom = merged.find((item) => item.provider === "custom");
          current.elevenlabs_api_key = eleven?.key ?? "";
          current.custom_voice_api_key = custom?.key ?? "";
          for (const alias of ["elevenlabs_api_key", "custom_voice_api_key"] as const) {
            await db
              .insert(platformSettings)
              .values({ key: alias, value: current[alias] ?? "", updatedAt: new Date() })
              .onConflictDoUpdate({
                target: platformSettings.key,
                set: { value: current[alias] ?? "", updatedAt: new Date() },
              });
          }
        } else if (SECRET_SETTING_KEYS.has(key) && looksLikeMaskedSecret(value)) {
          continue;
        }
        await db
          .insert(platformSettings)
          .values({ key, value, updatedAt: new Date() })
          .onConflictDoUpdate({
            target: platformSettings.key,
            set: { value, updatedAt: new Date() },
          });
        auditMeta[key] = SECRET_SETTING_KEYS.has(key)
          ? value.trim()
            ? "[updated]"
            : "[cleared]"
          : value;
      }

      await writeAuditLog({
        adminId: admin.id,
        action: "settings.update",
        entityType: "platform_settings",
        entityId: "global",
        metadata: auditMeta,
        request,
      });

      return await getPublicSettingsMap();
    } catch (err) {
      return sendAuthError(request, err);
    }
  });
}
