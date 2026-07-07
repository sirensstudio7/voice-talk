import { config } from "dotenv";
import { resolve } from "node:path";
import { z } from "zod";

config({ path: resolve(process.cwd(), "../../.env") });
config();

const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .default("postgresql://localhost:5432/voicetalk"),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-3.1-flash-live-preview"),
  JWT_SECRET: z.string().default("dev-secret-change-in-production"),
  JWT_EXPIRE_HOURS: z.coerce.number().default(72),
  API_PORT: z.coerce.number().default(8000),
  /** Render/Railway set PORT; prefer it over API_PORT in production. */
  PORT: z.coerce.number().optional(),
  DEFAULT_BUSINESS_SLUG: z.string().default("sunrise-coffee"),
  ADMIN_EMAIL: z.string().default("admin@sunrise.coffee"),
  ADMIN_PASSWORD: z.string().default("admin123"),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  /** Comma-separated origins for CORS, e.g. https://app.example.com,https://admin.example.com */
  ALLOWED_ORIGINS: z.string().optional(),
  /** Comma-separated production domains always allowed over HTTPS, e.g. lorescale.com */
  PRODUCTION_DOMAIN: z.string().default("lorescale.com"),
});

export const env = envSchema.parse(process.env);

export function getAllowedOrigins(): string[] | true {
  const raw = env.ALLOWED_ORIGINS?.trim();
  if (!raw) return true;
  return raw.split(",").map((o) => o.trim()).filter(Boolean);
}

function normalizeOrigin(origin: string): string {
  return origin.replace(/\/+$/, "");
}

type AllowedEntry =
  | { kind: "origin"; value: string }
  | { kind: "hostname"; value: string }
  | { kind: "domain"; value: string };

function parseAllowedEntry(entry: string): AllowedEntry {
  if (/^https?:\/\//i.test(entry)) {
    return { kind: "origin", value: normalizeOrigin(entry) };
  }
  const host = entry.startsWith("*.") ? entry.slice(2) : entry;
  if (host.includes(".")) {
    return { kind: "domain", value: host.toLowerCase() };
  }
  return { kind: "hostname", value: host.toLowerCase() };
}

function hostnameMatchesDomain(hostname: string, domain: string): boolean {
  const host = hostname.toLowerCase();
  return host === domain || host.endsWith(`.${domain}`);
}

export function getProductionDomains(): string[] {
  const raw = env.PRODUCTION_DOMAIN?.trim();
  if (!raw) return [];
  return raw.split(",").map((d) => d.trim()).filter(Boolean);
}

/** CORS origin check: explicit list + production domains + localhost + any Vercel deploy URL. */
export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;

  const allowed = getAllowedOrigins();
  if (allowed === true) return true;

  const normalized = normalizeOrigin(origin);

  try {
    const { hostname, protocol } = new URL(normalized);
    const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";

    const entries = [...allowed, ...getProductionDomains()];

    for (const entry of entries) {
      const parsed = parseAllowedEntry(entry);
      if (parsed.kind === "origin" && parsed.value === normalized) return true;
      if (parsed.kind === "hostname" && hostname.toLowerCase() === parsed.value) {
        return protocol === "https:" || isLocalhost;
      }
      if (parsed.kind === "domain" && hostnameMatchesDomain(hostname, parsed.value)) {
        return protocol === "https:" || isLocalhost;
      }
    }

    if (protocol === "http:" && isLocalhost) return true;
    if (protocol === "https:" && hostname.endsWith(".vercel.app")) return true;
  } catch {
    return false;
  }

  return false;
}

export function hasSupabaseStorage(): boolean {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}
