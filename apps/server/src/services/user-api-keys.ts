import { and, eq, inArray, ne, or } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { db } from "../db/client.js";
import { platformSettings, userApiKeys, type UserApiKey } from "../db/schema.js";
import { env } from "../env.js";
import { getOwnerUserIdForBusiness } from "./voice-minutes.js";

export const GEMINI_PROVIDER = "gemini";

export type PlatformProviderKey = {
  id: string;
  provider: string;
  label: string;
  key: string;
};

export type UserApiKeyAssignment = {
  source_id: string | null;
  provider: string | null;
  label: string | null;
};

export type PlatformProviderKeyPublic = {
  id: string;
  provider: string;
  label: string;
};

function parseProviderApiKeys(raw: string): PlatformProviderKey[] {
  try {
    const parsed = JSON.parse(raw || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as Record<string, unknown>;
      const id = String(row.id ?? "").trim();
      const provider = String(row.provider ?? "").trim().toLowerCase();
      if (!id || !provider) return [];
      return [
        {
          id,
          provider,
          label: String(row.label ?? "").trim(),
          key: String(row.key ?? ""),
        },
      ];
    });
  } catch {
    return [];
  }
}

export async function listPlatformProviderKeys(): Promise<PlatformProviderKey[]> {
  const row = await db.query.platformSettings.findFirst({
    where: eq(platformSettings.key, "provider_api_keys"),
  });
  return parseProviderApiKeys(row?.value ?? "[]").filter((item) => item.key.trim());
}

export function publicPlatformProviderKeys(
  keys: PlatformProviderKey[],
): PlatformProviderKeyPublic[] {
  return keys.map((item) => ({
    id: item.id,
    provider: item.provider,
    label: item.label || item.provider,
  }));
}

export async function listUserApiKeys(userId: string): Promise<UserApiKey[]> {
  return db.select().from(userApiKeys).where(eq(userApiKeys.userId, userId));
}

export async function usersWithCustomApiKeys(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const rows = await db
    .select({ userId: userApiKeys.userId })
    .from(userApiKeys)
    .where(
      and(
        inArray(userApiKeys.userId, userIds),
        or(ne(userApiKeys.sourceId, ""), ne(userApiKeys.apiKey, "")),
      ),
    );
  return new Set(rows.map((row) => row.userId));
}

async function resolveAssignedKey(
  row: UserApiKey | undefined,
  catalog: PlatformProviderKey[],
): Promise<string | null> {
  if (!row) return null;
  if (row.sourceId) {
    const match = catalog.find((item) => item.id === row.sourceId);
    const key = match?.key.trim() ?? "";
    if (key) return key;
  }
  const legacy = row.apiKey.trim();
  return legacy || null;
}

export async function getUserProviderKey(
  userId: string,
  provider: string,
): Promise<string | null> {
  const rows = await listUserApiKeys(userId);
  const catalog = await listPlatformProviderKeys();
  const match =
    rows.find((row) => row.provider === provider) ??
    rows.find((row) => catalog.find((item) => item.id === row.sourceId)?.provider === provider);
  return resolveAssignedKey(match, catalog);
}

export async function resolveGeminiApiKeyForUser(
  userId: string | null | undefined,
): Promise<string | undefined> {
  if (userId) {
    const owned = await getUserProviderKey(userId, GEMINI_PROVIDER);
    if (owned) return owned;
  }
  return env.GEMINI_API_KEY?.trim() || undefined;
}

export async function resolveGeminiApiKeyForBusiness(
  businessId: string,
): Promise<string | undefined> {
  const ownerId = await getOwnerUserIdForBusiness(businessId);
  return resolveGeminiApiKeyForUser(ownerId);
}

export function userAssignment(rows: UserApiKey[]): UserApiKeyAssignment {
  const row = rows[0];
  if (!row || (!row.sourceId && !row.apiKey.trim())) {
    return { source_id: null, provider: null, label: null };
  }
  return {
    source_id: row.sourceId || null,
    provider: row.provider,
    label: row.label || null,
  };
}

export async function setUserAssignedProviderKey(
  userId: string,
  sourceId: string | null,
): Promise<UserApiKey[]> {
  await db.delete(userApiKeys).where(eq(userApiKeys.userId, userId));
  const trimmed = sourceId?.trim() || "";
  if (!trimmed) return [];

  const catalog = await listPlatformProviderKeys();
  const match = catalog.find((item) => item.id === trimmed);
  if (!match) {
    const err = new Error("API key not found in platform Settings") as Error & {
      statusCode: number;
    };
    err.statusCode = 400;
    throw err;
  }

  const now = new Date();
  await db.insert(userApiKeys).values({
    id: randomUUID(),
    userId,
    provider: match.provider,
    label: match.label || match.provider,
    apiKey: "",
    sourceId: match.id,
    createdAt: now,
    updatedAt: now,
  });
  return listUserApiKeys(userId);
}
