import { expireQrTokens, deleteExpiredPhotos } from "./photo-moment.js";
import { withJobLock } from "../redis.js";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** Delay first run so boot / interactive traffic can use the small DB pool. */
const FIRST_RUN_DELAY_MS = 2 * 60 * 1000;

function isMissingRelation(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.message} ${(err as Error & { cause?: Error }).cause?.message ?? ""}` : "";
  return /relation .* does not exist/i.test(msg);
}

export function startPhotoMomentJobs(log: {
  info: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
  warn?: (obj: unknown, msg?: string) => void;
}): void {
  const runHourly = async () => {
    await withJobLock("photo-qr-expiry", HOUR_MS - 60_000, async () => {
      try {
        const n = await expireQrTokens();
        if (n > 0) log.info({ expired: n }, "Expired photo QR tokens");
      } catch (err) {
        if (isMissingRelation(err)) {
          log.warn?.({ err }, "Photo QR expiry skipped (tables not migrated yet)");
          return;
        }
        log.error({ err }, "Failed to expire photo QR tokens");
      }
    });
  };

  const runDaily = async () => {
    await withJobLock("photo-retention", DAY_MS - HOUR_MS, async () => {
      try {
        const n = await deleteExpiredPhotos();
        if (n > 0) log.info({ deleted: n }, "Deleted expired photo sessions");
      } catch (err) {
        if (isMissingRelation(err)) {
          log.warn?.({ err }, "Photo retention cleanup skipped (tables not migrated yet)");
          return;
        }
        log.error({ err }, "Failed to delete expired photos");
      }
    });
  };

  setTimeout(() => {
    void runHourly();
    void runDaily();
  }, FIRST_RUN_DELAY_MS);

  setInterval(() => void runHourly(), HOUR_MS);
  setInterval(() => void runDaily(), DAY_MS);
}
