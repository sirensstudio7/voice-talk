import { buildApp, MAX_BODY_BYTES } from "./app.js";
import { closeDb, startDbPoolWatchdog } from "./db/client.js";
import { warmDbConnection } from "./db/health.js";
import { env, getProductionDomains, hasObjectStorage } from "./env.js";
import { logger } from "./http/logger.js";
import { closeRedis } from "./redis.js";
import { startPhotoMomentJobs } from "./services/photo-jobs.js";
import { registerVoiceMinuteJobs } from "./services/voice-minute-jobs.js";

const app = await buildApp();

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
  logger.info({ signal }, "server.shutdown");
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
