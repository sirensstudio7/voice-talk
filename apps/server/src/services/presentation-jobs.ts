import { and, eq, lte } from "drizzle-orm";

import { db } from "../db/client.js";
import { presentations } from "../db/schema.js";
import { logger } from "../http/logger.js";
import { inc } from "../http/metrics.js";
import { withIntervalLock } from "../redis.js";

/**
 * Presentation pipeline recovery (TKT-010).
 *
 * Prepare runs in-process with no queue. If the instance is recycled mid-run
 * the deck stays `processing` forever and the merchant sees a spinner. This
 * sweeper marks abandoned rows as failed so the UI offers "Retry prepare".
 * The interval lock keeps a single run per bucket across instances.
 */
const STUCK_AFTER_MS = 15 * 60 * 1000;
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

const log = logger.child({ component: "jobs" });

export async function sweepStuckPresentations(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - STUCK_AFTER_MS);
  const stuck = await db
    .update(presentations)
    .set({
      status: "failed",
      processingStep: "failed",
      processingError: "Preparation was interrupted. Retry prepare.",
      updatedAt: now,
    })
    .where(and(eq(presentations.status, "processing"), lte(presentations.updatedAt, cutoff)))
    .returning({ id: presentations.id });

  if (stuck.length > 0) {
    inc("presenter.processing_stuck_total", stuck.length);
    log.warn(
      { count: stuck.length, presentationIds: stuck.map((row) => row.id) },
      "presentations.stuck_recovered",
    );
  }
  return stuck.length;
}

export function startPresentationJobs(): void {
  const tick = async () => {
    await withIntervalLock("presenter-stuck-sweep", SWEEP_INTERVAL_MS, async () => {
      try {
        await sweepStuckPresentations();
      } catch (err) {
        log.error({ err }, "presentations.sweep_failed");
      }
    });
  };

  void tick();
  setInterval(() => {
    void tick();
  }, SWEEP_INTERVAL_MS).unref();
}
