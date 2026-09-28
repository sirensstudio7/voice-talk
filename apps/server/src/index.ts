import { buildApp, MAX_BODY_BYTES } from "./app.js";
import { closeDb, startDbPoolWatchdog } from "./db/client.js";
import { warmDbConnection } from "./db/health.js";
import { env, getProductionDomains, hasObjectStorage } from "./env.js";
import { logger } from "./http/logger.js";
import { closeRedis } from "./redis.js";
import { startPhotoMomentJobs } from "./services/photo-jobs.js";
import { registerVoiceMinuteJobs } from "./services/voice-minute-jobs.js";

const app = await buildApp();

startPhotoMomentJobs(logger);
registerVoiceMinuteJobs(logger);

const start = async () => {
  const allowedOrigins = env.ALLOWED_ORIGINS?.trim();
  const productionDomains = getProductionDomains();
  console.info(`Gemini model default: ${env.GEMINI_MODEL}`);
  console.info(`API key configured: ${Boolean(env.GEMINI_API_KEY)}`);
  console.info(`Default business slug: ${env.DEFAULT_BUSINESS_SLUG}`);
  console.info(`Object storage: ${hasObjectStorage() ? "s3" : "local disk"}`);
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
  closeRedis();
  await closeDb();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

start().catch((err) => {
  console.error(err);
  process.exit(1);
});

export { app };
