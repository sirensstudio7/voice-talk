import { inArray, lt } from "drizzle-orm";

import { db } from "../db/client.js";
import { analyticsEvents, visionEvents } from "../db/schema.js";
import { env } from "../env.js";
import { logger } from "../http/logger.js";
import { inc } from "../http/metrics.js";
import { withIntervalLock } from "../redis.js";

/**
 * Data retention for event tables (TKT-008).
 *
 * Analytics and vision events grow forever otherwise. Deletes run in batches
 * so one statement cannot lock a big table for long, and the job is guarded by
 * the shared interval lock so only one instance runs it per day. Cutoffs are
 * env-configurable; dashboards aggregate over bounded windows anyway.
 */
const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_INTERVAL_MS = DAY_MS;
const BATCH_SIZE = 5_000;
const MAX_BATCHES = 200;

const log = logger.child({ component: "jobs" });

async function deleteAnalyticsOlderThan(cutoff: Date): Promise<number> {
  let total = 0;
  for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
    const ids = await db
      .select({ id: analyticsEvents.id })
      .from(analyticsEvents)
      .where(lt(analyticsEvents.createdAt, cutoff))
      .limit(BATCH_SIZE);
    if (ids.length === 0) break;
    const deleted = await db
      .delete(analyticsEvents)
      .where(inArray(analyticsEvents.id, ids.map((row) => row.id)))
      .returning({ id: analyticsEvents.id });
    total += deleted.length;
    if (ids.length < BATCH_SIZE) break;
  }
  return total;
}

async function deleteVisionEventsOlderThan(cutoff: Date): Promise<number> {
  let total = 0;
  for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
    const ids = await db
      .select({ id: visionEvents.id })
      .from(visionEvents)
      .where(lt(visionEvents.createdAt, cutoff))
      .limit(BATCH_SIZE);
    if (ids.length === 0) break;
    const deleted = await db
      .delete(visionEvents)
      .where(inArray(visionEvents.id, ids.map((row) => row.id)))
      .returning({ id: visionEvents.id });
    total += deleted.length;
    if (ids.length < BATCH_SIZE) break;
  }
  return total;
}

export async function runAnalyticsRetention(
  now = new Date(),
): Promise<{ analytics: number; vision: number }> {
  const analyticsCutoff = new Date(now.getTime() - env.ANALYTICS_RETENTION_DAYS * DAY_MS);
  const visionCutoff = new Date(now.getTime() - env.VISION_RETENTION_DAYS * DAY_MS);

  const analytics = await deleteAnalyticsOlderThan(analyticsCutoff);
  const vision = await deleteVisionEventsOlderThan(visionCutoff);
  return { analytics, vision };
}

export function startAnalyticsRetentionJobs(): void {
  const tick = async () => {
    await withIntervalLock("analytics-retention", RETENTION_INTERVAL_MS, async () => {
      try {
        const deleted = await runAnalyticsRetention();
        if (deleted.analytics > 0) {
          inc("analytics.retention_deleted_analytics_total", deleted.analytics);
        }
        if (deleted.vision > 0) {
          inc("analytics.retention_deleted_vision_total", deleted.vision);
        }
        log.info(deleted, "analytics.retention");
      } catch (err) {
        log.error({ err }, "analytics.retention_failed");
      }
    });
  };

  void tick();
  setInterval(() => {
    void tick();
  }, 60 * 60 * 1000).unref();
}
