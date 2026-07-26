import type { FastifyInstance } from "fastify";
import { checkDbHealth } from "../db/health.js";
import { env } from "../env.js";

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async (request) => {
    const query = request.query as { db?: string };
    const checkDb = query.db === "1";
    const db = checkDb ? await checkDbHealth(5000, true) : await checkDbHealth();
    return {
      status: db.online ? "ok" : checkDb ? "degraded" : "ok",
      model: env.GEMINI_MODEL,
      ai_online: Boolean(env.GEMINI_API_KEY),
      db_online: db.online,
      db_latency_ms: db.latencyMs,
      ...(checkDb && !db.online && db.error ? { db_error: db.error } : {}),
    };
  });
}
