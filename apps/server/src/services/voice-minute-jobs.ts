import type { Logger } from "../http/logger.js";

import { withIntervalLock } from "../redis.js";
import { sweepOrphanVoiceSessions } from "./voice-minutes.js";

const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const FIRST_RUN_DELAY_MS = 2 * 60 * 1000;

function isMissingRelation(err: unknown): boolean {
  const msg =
    err instanceof Error ? `${err.message} ${(err as Error & { cause?: Error }).cause?.message ?? ""}` : "";
  return /relation .* does not exist/i.test(msg);
}

export function registerVoiceMinuteJobs(log: Logger): void {
  const run = async () => {
    await withIntervalLock("voice-minute-sweep", SWEEP_INTERVAL_MS, async () => {
      try {
        const n = await sweepOrphanVoiceSessions();
        if (n > 0) log.info({ closed: n }, "Closed orphan voice sessions and debited minutes");
      } catch (err) {
        if (isMissingRelation(err)) {
          log.warn?.({ err }, "Voice minute orphan sweep skipped (tables not migrated yet)");
          return;
        }
        log.error({ err }, "Failed to sweep orphan voice sessions");
      }
    });
  };

  setTimeout(() => {
    void run();
  }, FIRST_RUN_DELAY_MS);
  setInterval(() => void run(), SWEEP_INTERVAL_MS);
}
