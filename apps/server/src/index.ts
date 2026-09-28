import { mkdir } from "node:fs/promises";
import { cors } from "@elysiajs/cors";
import { staticPlugin } from "@elysiajs/static";
import { Elysia } from "elysia";
import { closeDb, startDbPoolWatchdog } from "./db/client.js";
import { warmDbConnection } from "./db/health.js";
import { env, getProductionDomains, hasSupabaseStorage, isAllowedOrigin } from "./env.js";
import { logger } from "./http/logger.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerPlatformRoutes } from "./routes/platform.js";
import { registerPresentationRoutes } from "./routes/presentations.js";
import { registerPublicRoutes } from "./routes/public.js";
import { registerPresentationWebSocketRoutes } from "./routes/presentation-websocket.js";
import { registerWebSocketRoutes } from "./routes/websocket.js";
import { registerVisionWebSocketRoutes } from "./routes/vision-ws.js";
import { registerLuckySpinRoutes } from "./routes/lucky-spin.js";
import { registerCampaignBannerRoutes } from "./routes/campaign-banner.js";
import { registerLiveRoutes } from "./routes/live.js";
import { registerLiveWebSocketRoutes } from "./routes/live-websocket.js";
import { startPhotoMomentJobs } from "./services/photo-jobs.js";
import { registerVoiceMinuteJobs } from "./services/voice-minute-jobs.js";
import { getUploadRoot, MAX_PRESENTATION_UPLOAD_BYTES } from "./storage/index.js";

// Elysia recommends precompile for production: route handlers are compiled
// ahead of time at boot instead of on first request.
export const app = new Elysia({ precompile: true });

app.use(
  cors({
    origin: ({ headers }) => isAllowedOrigin(headers.get("origin") ?? undefined),
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  }),
);

/** Elysia caps request bodies per-server rather than per-plugin. */
export const MAX_BODY_BYTES = Math.max(8 * 1024 * 1024, MAX_PRESENTATION_UPLOAD_BYTES);

/** `ip` replaces Fastify's `request.ip`, used for audit-log attribution. */
app.derive(({ server, request }) => ({
  ip: server?.requestIP(request)?.address ?? "",
}));

if (!hasSupabaseStorage()) {
  const uploadRoot = getUploadRoot();
  await mkdir(uploadRoot, { recursive: true });
  app.use(staticPlugin({ assets: uploadRoot, prefix: "/uploads", indexHTML: false }));
}

registerHealthRoutes(app);
registerPublicRoutes(app);
registerAdminRoutes(app);
registerPresentationRoutes(app);
registerLuckySpinRoutes(app);
registerCampaignBannerRoutes(app);
registerLiveRoutes(app);
registerPlatformRoutes(app);
registerWebSocketRoutes(app);
registerPresentationWebSocketRoutes(app);
registerLiveWebSocketRoutes(app);
registerVisionWebSocketRoutes(app);
startPhotoMomentJobs(logger);
registerVoiceMinuteJobs(logger);

app.onError(({ error, code, set }) => {
  if (code === "NOT_FOUND") {
    set.status = 404;
    return { detail: "Not Found" };
  }

  const err = error as Error & { statusCode?: number; cause?: Error };
  set.status = err.statusCode ?? 500;

  const cause =
    err.name === "DrizzleQueryError" && err.cause?.message ? err.cause.message : err.message;
  const combined = `${err.message} ${cause}`;
  const detail = /CONNECT_TIMEOUT|connect timed out|timed out|ECONNREFUSED|connection/i.test(
    combined,
  )
    ? "Database connection timed out. Please retry in a moment."
    : cause;

  return { detail };
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

  await warmDbConnection();
  startDbPoolWatchdog();

  app.listen(
    {
      port: env.PORT ?? env.API_PORT,
      hostname: "0.0.0.0",
      maxRequestBodySize: MAX_BODY_BYTES,
    },
    ({ hostname, port }) => logger.info({ hostname, port }, "Server listening"),
  );
};

const shutdown = async () => {
  await app.stop();
  await closeDb();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
