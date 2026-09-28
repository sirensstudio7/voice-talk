/**
 * Minimal structured logger.
 *
 * Fastify shipped a pino instance as `app.log`; Elysia has no logger of its own.
 * This keeps the same `(obj, msg)` call shape the job modules already use, and
 * the same newline-delimited JSON on stdout for any log collector.
 */
export type Logger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
};

const LEVELS = { info: 30, warn: 40, error: 50 } as const;

function emit(level: keyof typeof LEVELS, obj: unknown, msg?: string): void {
  const base: Record<string, unknown> = {
    level: LEVELS[level],
    time: Date.now(),
    pid: process.pid,
  };

  if (obj instanceof Error) {
    base.err = { type: obj.name, message: obj.message, stack: obj.stack };
  } else if (obj && typeof obj === "object") {
    Object.assign(base, obj);
  } else if (obj !== undefined) {
    base.msg = obj;
  }
  if (msg !== undefined) base.msg = msg;

  const line = JSON.stringify(base, (_k, v) =>
    v instanceof Error ? { type: v.name, message: v.message, stack: v.stack } : v,
  );
  if (level === "error") console.error(line);
  else console.log(line);
}

export const logger: Logger = {
  info: (obj, msg) => emit("info", obj, msg),
  warn: (obj, msg) => emit("warn", obj, msg),
  error: (obj, msg) => emit("error", obj, msg),
};
