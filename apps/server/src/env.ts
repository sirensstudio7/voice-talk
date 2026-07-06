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
  DEFAULT_BUSINESS_SLUG: z.string().default("sunrise-coffee"),
  ADMIN_EMAIL: z.string().default("admin@sunrise.coffee"),
  ADMIN_PASSWORD: z.string().default("admin123"),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  /** Comma-separated origins for CORS, e.g. https://app.example.com,https://admin.example.com */
  ALLOWED_ORIGINS: z.string().optional(),
});

export const env = envSchema.parse(process.env);

export function getAllowedOrigins(): string[] | true {
  const raw = env.ALLOWED_ORIGINS?.trim();
  if (!raw) return true;
  return raw.split(",").map((o) => o.trim()).filter(Boolean);
}

export function hasSupabaseStorage(): boolean {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}
