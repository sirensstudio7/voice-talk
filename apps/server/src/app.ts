import { mkdir } from "node:fs/promises";
import { cors } from "@elysiajs/cors";
import { staticPlugin } from "@elysiajs/static";
import { Elysia } from "elysia";
import { hasObjectStorage, isAllowedOrigin } from "./env.js";
import { publicErrorDetail } from "./http/errors.js";
import { logger } from "./http/logger.js";
import { registerRequestLogging } from "./http/request-logging.js";
import { validationDetail } from "./http/validation.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerCampaignBannerRoutes } from "./routes/campaign-banner.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerLiveRoutes } from "./routes/live.js";
import { registerLiveWebSocketRoutes } from "./routes/live-websocket.js";
import { registerLuckySpinRoutes } from "./routes/lucky-spin.js";
import { registerPlatformRoutes } from "./routes/platform.js";
import { registerPresentationRoutes } from "./routes/presentations.js";
import { registerPresentationWebSocketRoutes } from "./routes/presentation-websocket.js";
import { registerPublicRoutes } from "./routes/public.js";
import { registerVisionWebSocketRoutes } from "./routes/vision-ws.js";
import { registerWebSocketRoutes } from "./routes/websocket.js";
import { getUploadRoot, MAX_PRESENTATION_UPLOAD_BYTES } from "./storage/index.js";

/** Elysia caps request bodies per-server rather than per-plugin. */
export const MAX_BODY_BYTES = Math.max(8 * 1024 * 1024, MAX_PRESENTATION_UPLOAD_BYTES);

/**
 * Builds the fully registered API instance. Separate from `index.ts` so
 * tests can boot the app in-process without a listening server.
 */
export async function buildApp(): Promise<Elysia> {
  // Elysia recommends precompile for production: route handlers are compiled
  // ahead of time at boot instead of on first request.
  const app = new Elysia({ precompile: true });

  app.use(
    cors({
      origin: ({ headers }) => isAllowedOrigin(headers.get("origin") ?? undefined),
      credentials: true,
      methods: ["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
      // Lets the browser apps read the correlation id off failed responses.
      exposeHeaders: ["x-request-id"],
    }),
  );

  /** `ip` replaces Fastify's `request.ip`, used for audit-log attribution. */
  app.derive(({ server, request }) => ({
    ip: server?.requestIP(request)?.address ?? "",
  }));

  // Request correlation and the access log. Registered before routes (like
  // onError below) because precompile attaches hooks at route registration.
  registerRequestLogging(app);

  if (!hasObjectStorage()) {
    const uploadRoot = getUploadRoot();
    await mkdir(uploadRoot, { recursive: true });
    app.use(staticPlugin({ assets: uploadRoot, prefix: "/uploads", indexHTML: false }));
  }

  // onError must be registered before the routes: Elysia resolves the error
  // handler when a route is added, so a later hook never sees validation
  // errors from earlier routes.
  app.onError(({ error, code, request, set }) => {
    if (code === "NOT_FOUND") {
      set.status = 404;
      return { detail: "Not Found" };
    }

    if (code === "VALIDATION") {
      set.status = 400;
      return { detail: validationDetail(error) };
    }

    const err = error as Error & { statusCode?: number; cause?: Error };
    const status = err.statusCode ?? 500;
    set.status = status;

    if (status >= 500) {
      // Unhandled failures are the lines an incident review starts from. The
      // full error (stack + cause) goes to the log; the response gets generic
      // copy that never leaks SQL or connection internals.
      const { pathname } = new URL(request.url);
      logger.error(
        { err, status, method: request.method, path: pathname },
        "http.error",
      );
    }

    return { detail: publicErrorDetail(err, status) };
  });

  // Every registration must finish before listen(): precompile compiles the
  // router at listen time, so a route added later is never served.
  await registerHealthRoutes(app);
  await registerPublicRoutes(app);
  await registerAdminRoutes(app);
  await registerPresentationRoutes(app);
  await registerLuckySpinRoutes(app);
  await registerCampaignBannerRoutes(app);
  await registerLiveRoutes(app);
  await registerPlatformRoutes(app);
  await registerWebSocketRoutes(app);
  await registerPresentationWebSocketRoutes(app);
  await registerLiveWebSocketRoutes(app);
  await registerVisionWebSocketRoutes(app);

  return app;
}
