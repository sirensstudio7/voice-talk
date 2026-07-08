import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import Fastify from "fastify";
import { closeDb } from "./db/client.js";
import { env, getProductionDomains, hasSupabaseStorage, isAllowedOrigin } from "./env.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerPublicRoutes } from "./routes/public.js";
import { registerWebSocketRoutes } from "./routes/websocket.js";
import { getUploadRoot } from "./storage/index.js";

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: (origin, cb) => {
    if (isAllowedOrigin(origin)) {
      cb(null, true);
      return;
    }
    app.log.warn({ origin }, "CORS origin not allowed");
    cb(null, false);
  },
  credentials: true,
  methods: ["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
});

await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024 } });
await app.register(websocket);

if (!hasSupabaseStorage()) {
  const uploadRoot = getUploadRoot();
  await mkdir(uploadRoot, { recursive: true });
  await app.register(fastifyStatic, {
    root: uploadRoot,
    prefix: "/uploads/",
    decorateReply: false,
  });
}

await registerHealthRoutes(app);
await registerPublicRoutes(app);
await registerAdminRoutes(app);
await registerWebSocketRoutes(app);

app.setErrorHandler((error, _request, reply) => {
  const err = error as Error & { statusCode?: number };
  const statusCode = err.statusCode ?? 500;
  reply.status(statusCode).send({ detail: err.message });
});

const start = async () => {
  const allowedOrigins = env.ALLOWED_ORIGINS?.trim();
  const productionDomains = getProductionDomains();
  console.info(`Gemini model default: ${env.GEMINI_MODEL}`);
  console.info(`API key configured: ${Boolean(env.GEMINI_API_KEY)}`);
  console.info(`Default business slug: ${env.DEFAULT_BUSINESS_SLUG}`);
  console.info(`Supabase storage: ${hasSupabaseStorage()}`);
  console.info(`CORS allowed origins: ${allowedOrigins || "(all)"}`);
  console.info(`CORS production domains: ${productionDomains.join(", ") || "(none)"}`);

  await app.listen({ port: env.PORT ?? env.API_PORT, host: "0.0.0.0" });
};

process.on("SIGINT", async () => {
  await app.close();
  await closeDb();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await app.close();
  await closeDb();
  process.exit(0);
});

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
