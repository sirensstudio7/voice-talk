import type { FastifyInstance } from "fastify";
import { env } from "../env.js";

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async () => ({
    status: "ok",
    model: env.GEMINI_MODEL,
    ai_online: Boolean(env.GEMINI_API_KEY),
  }));
}
