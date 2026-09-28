import { eq, inArray } from "drizzle-orm";

import { db } from "../../db/client.js";
import { businessMembers, platformSettings, subscriptions } from "../../db/schema.js";
import { usersWithCustomApiKeys } from "../../services/user-api-keys.js";

export function parsePagination(query: Record<string, unknown>) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

export type ProviderApiKey = {
  id: string;
  provider: string;
  label: string;
  key: string;
};

export function maskSecret(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return `••••••••${trimmed.slice(-4)}`;
}

export function parseProviderApiKeys(raw: string): ProviderApiKey[] {
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

export function withLegacyProviderKeys(map: Record<string, string>): ProviderApiKey[] {
  const items = parseProviderApiKeys(map.provider_api_keys ?? "[]");
  const has = (provider: string) => items.some((item) => item.provider === provider && item.key.trim());
  if ((map.elevenlabs_api_key ?? "").trim() && !has("elevenlabs")) {
    items.push({
      id: "legacy-elevenlabs",
      provider: "elevenlabs",
      label: "ElevenLabs",
      key: map.elevenlabs_api_key,
    });
  }
  if ((map.custom_voice_api_key ?? "").trim() && !has("custom")) {
    items.push({
      id: "legacy-custom",
      provider: "custom",
      label: "Custom",
      key: map.custom_voice_api_key,
    });
  }
  return items;
}

export function redactSettings(map: Record<string, string>): Record<string, string> {
  const out = { ...map };
  const items = withLegacyProviderKeys(out);
  out.provider_api_keys = JSON.stringify(
    items.map((item) => ({
      id: item.id,
      provider: item.provider,
      label: item.label,
      key: maskSecret(item.key),
      set: Boolean(item.key.trim()),
    })),
  );
  for (const key of ["elevenlabs_api_key", "custom_voice_api_key"] as const) {
    const raw = out[key] ?? "";
    out[`${key}_set`] = raw.trim() ? "true" : "false";
    out[key] = maskSecret(raw);
  }
  return out;
}

export async function getSettingsMap(): Promise<Record<string, string>> {
  const rows = await db.select().from(platformSettings);
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export const DEFAULT_USD_IDR_RATE = 16500;

export const FX_CACHE_MS = 15 * 60 * 1000;

export let cachedUsdIdr: { rate: number; fetchedAt: number; marketAt: string | null; source: string } | null =
  null;

export type UsdIdrQuote = {
  rate: number;
  market_at: string | null;
  source: "live" | "manual" | "fallback";
};

export async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2500) });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export async function fetchLiveUsdIdr(): Promise<{ rate: number; marketAt: string; source: string } | null> {
  const open = (await fetchJson("https://open.er-api.com/v6/latest/USD")) as {
    result?: string;
    time_last_update_utc?: string;
    rates?: { IDR?: number };
  } | null;
  const openRate = Number(open?.rates?.IDR);
  if (open?.result === "success" && Number.isFinite(openRate) && openRate > 0) {
    return {
      rate: openRate,
      marketAt: open.time_last_update_utc ?? new Date().toISOString(),
      source: "open.er-api.com",
    };
  }

  const frankfurter = (await fetchJson("https://api.frankfurter.app/latest?from=USD&to=IDR")) as {
    date?: string;
    rates?: { IDR?: number };
  } | null;
  const frankRate = Number(frankfurter?.rates?.IDR);
  if (Number.isFinite(frankRate) && frankRate > 0) {
    return {
      rate: frankRate,
      marketAt: frankfurter?.date ? `${frankfurter.date}T00:00:00.000Z` : new Date().toISOString(),
      source: "frankfurter.app",
    };
  }
  return null;
}

export async function resolveUsdIdrQuote(): Promise<UsdIdrQuote> {
  const settings = await getSettingsMap();
  const override = Number(settings.usd_idr_rate);
  if (Number.isFinite(override) && override > 0) {
    return { rate: override, market_at: null, source: "manual" };
  }
  if (cachedUsdIdr && Date.now() - cachedUsdIdr.fetchedAt < FX_CACHE_MS) {
    return { rate: cachedUsdIdr.rate, market_at: cachedUsdIdr.marketAt, source: "live" };
  }
  const live = await fetchLiveUsdIdr();
  if (live) {
    cachedUsdIdr = {
      rate: live.rate,
      fetchedAt: Date.now(),
      marketAt: live.marketAt,
      source: live.source,
    };
    return { rate: live.rate, market_at: live.marketAt, source: "live" };
  }
  if (cachedUsdIdr) {
    return { rate: cachedUsdIdr.rate, market_at: cachedUsdIdr.marketAt, source: "live" };
  }
  return { rate: DEFAULT_USD_IDR_RATE, market_at: null, source: "fallback" };
}

export async function ensureSubscriptionForBusiness(businessId: string) {
  const existing = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.businessId, businessId),
  });
  if (existing) return existing;
  const [created] = await db
    .insert(subscriptions)
    .values({
      businessId,
      planName: "starter",
      billingCycle: "monthly",
      status: "active",
      startDate: new Date(),
    })
    .returning();
  return created!;
}

export async function enrichUsers(
  rows: Array<{
    id: string;
    name: string;
    email: string;
    phone: string;
    status: string;
    createdAt: Date;
    lastLoginAt: Date | null;
  }>,
) {
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const keyedUsers = await usersWithCustomApiKeys(ids);
  const memberRows = await db
    .select({
      userId: businessMembers.userId,
      businessId: businessMembers.businessId,
      role: businessMembers.role,
      planName: subscriptions.planName,
    })
    .from(businessMembers)
    .leftJoin(subscriptions, eq(subscriptions.businessId, businessMembers.businessId))
    .where(inArray(businessMembers.userId, ids));

  const byUser = new Map<
    string,
    { count: number; plan: string | null; owners: Array<{ plan: string | null }> }
  >();
  for (const id of ids) byUser.set(id, { count: 0, plan: null, owners: [] });
  for (const row of memberRows) {
    const entry = byUser.get(row.userId);
    if (!entry) continue;
    entry.count += 1;
    if (row.role === "owner") {
      entry.owners.push({ plan: row.planName });
      if (!entry.plan) entry.plan = row.planName;
    } else if (!entry.plan) {
      entry.plan = row.planName;
    }
  }

  return rows.map((row) => {
    const meta = byUser.get(row.id);
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone || null,
      status: row.status,
      workspace_count: meta?.count ?? 0,
      plan: meta?.plan ?? "starter",
      has_custom_api_keys: keyedUsers.has(row.id),
      created_at: row.createdAt.toISOString(),
      last_login_at: row.lastLoginAt?.toISOString() ?? null,
    };
  });
}

export function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
