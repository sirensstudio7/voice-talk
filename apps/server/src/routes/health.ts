import { t, type Elysia } from "elysia";
import { checkDbHealth } from "../db/health.js";
import { env } from "../env.js";
import { optionalString } from "../http/validation.js";
import { checkRedisHealth } from "../redis.js";

export async function registerHealthRoutes(app: Elysia): Promise<void> {
  app.get("/health", async (request) => {
    const query = request.query;
    const checkDb = query.db === "1";
    const db = checkDb ? await checkDbHealth(5000, true) : await checkDbHealth();
    const redis = await checkRedisHealth(checkDb);
    return {
      status: db.online ? "ok" : checkDb ? "degraded" : "ok",
      model: env.GEMINI_MODEL,
      ai_online: Boolean(env.GEMINI_API_KEY),
      db_online: db.online,
      db_latency_ms: db.latencyMs,
      redis_online: redis.online,
      redis_latency_ms: redis.latencyMs,
      ...(checkDb && !db.online && db.error ? { db_error: db.error } : {}),
    };
  }, {
    query: t.Object({ db: optionalString }),
  });
}
