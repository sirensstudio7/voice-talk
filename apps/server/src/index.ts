import { buildApp, MAX_BODY_BYTES } from "./app.js";
import { closeDb, startDbPoolWatchdog } from "./db/client.js";
import { warmDbConnection } from "./db/health.js";
import { env, getProductionDomains, hasObjectStorage } from "./env.js";
import { logger } from "./http/logger.js";
import { inc } from "./http/metrics.js";
import { activeWebSocketCount, drainWebSockets } from "./http/websocket.js";
import { closeRedis } from "./redis.js";
import { applyRemoteKioskPayload } from "./services/vision-orchestrator.js";
import { startKioskBus, stopKioskBus } from "./services/kiosk-bus.js";
import { startPhotoMomentJobs } from "./services/photo-jobs.js";
import { registerVoiceMinuteJobs } from "./services/voice-minute-jobs.js";

/** Grace period for clients to reconnect elsewhere before the server stops. */
const SHUTDOWN_DRAIN_MS = 3_000;

const app = await buildApp();

// Cross-instance fanout for kiosk config pushes (settings changes, banners).
// Realtime vision events stay on the socket that owns the camera, by design.
startKioskBus((businessSlug, payload) => applyRemoteKioskPayload(businessSlug, payload));

startPhotoMomentJobs(logger.child({ component: "jobs" }));
registerVoiceMinuteJobs(logger.child({ component: "jobs" }));

const start = async () => {
  const allowedOrigins = env.ALLOWED_ORIGINS?.trim();
  const productionDomains = getProductionDomains();

  await warmDbConnection();
  startDbPoolWatchdog();

  app.listen(
    {
      port: env.PORT ?? env.API_PORT,
      hostname: "0.0.0.0",
      maxRequestBodySize: MAX_BODY_BYTES,
    },
    ({ hostname, port }) =>
      logger.info(
        {
          hostname,
          port,
          model: env.GEMINI_MODEL,
          gemini_key_configured: Boolean(env.GEMINI_API_KEY),
          storage: hasObjectStorage() ? "s3" : "local",
          default_business_slug: env.DEFAULT_BUSINESS_SLUG,
          cors_origins: allowedOrigins || "(all)",
          cors_production_domains: productionDomains.join(",") || "(none)",
        },
        "server.listening",
      ),
  );
};

let shuttingDown = false;
const shutdown = async (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  const sockets = activeWebSocketCount();
  logger.info({ signal, activeWebSockets: sockets }, "server.shutdown");
  inc("server.shutdowns_total");

  // Ask clients to reconnect elsewhere (close 1012) and give them a moment on
  // the new instance before this one stops answering.
  const drained = drainWebSockets();
  if (drained > 0) {
    logger.info({ drained }, "server.draining_websockets");
    await new Promise((resolve) => setTimeout(resolve, SHUTDOWN_DRAIN_MS));
  }

  stopKioskBus();
  await app.stop();
  closeRedis();
  await closeDb();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

// A process that reached an undefined state must not keep serving traffic;
// the supervisor restarts it. Rejections are logged but do not exit: this
// server has many fire-and-forget tasks where one rejected promise is benign.
process.on("uncaughtException", (error) => {
  logger.error({ err: error }, "server.fatal");
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "server.unhandled_rejection");
});

start().catch((err) => {
  logger.error({ err }, "server.fatal");
  process.exit(1);
});

export { app };
