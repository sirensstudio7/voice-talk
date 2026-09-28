import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { publicErrorDetail } from "../src/http/errors.js";
import {
  __setLogLevel,
  __setLogSink,
  logContext,
  logger,
  shouldLogThrottled,
} from "../src/http/logger.js";
import { registerRequestLogging } from "../src/http/request-logging.js";

/**
 * Unit tests for the logging contract. These run without Postgres or Redis:
 * the sink is captured in-process and the request hooks are exercised on a
 * throwaway Elysia instance.
 */

type Entry = Record<string, unknown>;

let lines: string[];

function all(): Entry[] {
  return lines.map((line) => JSON.parse(line) as Entry);
}

beforeEach(() => {
  lines = [];
  __setLogSink((line) => lines.push(line));
  __setLogLevel("debug");
});

afterEach(() => {
  __setLogSink(null);
  __setLogLevel(null);
});

/** `onAfterResponse` runs from a setImmediate; give it a macrotask to land. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 25));

/**
 * Polls for a log line instead of asserting immediately: access lines are
 * written from `onAfterResponse`, which can land after the client already has
 * the response (notably on slower CI runners and on error responses). A fixed
 * delay raced it; polling removes the flake.
 */
async function find(
  msg: string,
  extra?: (entry: Entry) => boolean,
  timeoutMs = 2000,
): Promise<Entry> {
  const deadline = Date.now() + timeoutMs;
  let entry = all().find((e) => e.msg === msg && (!extra || extra(e)));
  while (!entry && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    entry = all().find((e) => e.msg === msg && (!extra || extra(e)));
  }
  expect(entry).toBeDefined();
  return entry!;
}

describe("logger", () => {
  test("emits NDJSON with level, severity, service and msg", () => {
    logger.info({ businessSlug: "sunrise" }, "ws.session");

    const entries = all();
    expect(entries).toHaveLength(1);
    const entry = entries[0]!;
    expect(entry.level).toBe(30);
    expect(entry.severity).toBe("INFO");
    expect(entry.service).toBe("voicetalk-server");
    expect(entry.msg).toBe("ws.session");
    expect(entry.businessSlug).toBe("sunrise");
    expect(Number.isNaN(new Date(entry.time as string).getTime())).toBe(false);
  });

  test("filters lines below the configured level", () => {
    __setLogLevel("warn");
    logger.info({}, "ignored");
    logger.warn({}, "kept");

    const entries = all();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.severity).toBe("WARNING");
  });

  test("child bindings and request context merge into the line", async () => {
    const child = logger.child({ component: "live" });
    logContext.run({ requestId: "req-123" }, () => {
      child.error({ err: new Error("boom") }, "gemini.failed");
    });

    const entry = await find("gemini.failed");
    expect(entry.component).toBe("live");
    expect(entry.requestId).toBe("req-123");
    expect(entry.err).toMatchObject({ type: "Error", message: "boom" });
    expect(typeof (entry.err as Entry).stack).toBe("string");
  });

  test("serializes an error cause chain", async () => {
    const err = new Error("query failed", { cause: new Error("connection reset") });
    logger.error({ err }, "http.error");

    const entry = await find("http.error");
    expect((entry.err as { cause?: { message?: string } }).cause?.message).toBe(
      "connection reset",
    );
  });

  test("redacts secret-named fields at any depth", async () => {
    logger.info(
      {
        password: "hunter2",
        api_key: "sk-live-123",
        nested: { authorization: "Bearer abc", keep: "visible" },
      },
      "auth.debug",
    );

    const entry = await find("auth.debug");
    expect(entry.password).toBe("[redacted]");
    expect(entry.api_key).toBe("[redacted]");
    expect((entry.nested as Entry).authorization).toBe("[redacted]");
    expect((entry.nested as Entry).keep).toBe("visible");
  });

  test("never throws on unserializable fields", async () => {
    logger.info({ big: 1n }, "bigint.probe");

    const entry = await find("bigint.probe");
    expect(entry.msg).toBe("bigint.probe");
  });

  test("includes the deploy marker when GIT_SHA is set", async () => {
    process.env.GIT_SHA = "abc1234";
    try {
      logger.info({}, "server.listening");
    } finally {
      delete process.env.GIT_SHA;
    }

    expect((await find("server.listening")).version).toBe("abc1234");
  });
});

describe("shouldLogThrottled", () => {
  test("allows the first line and suppresses repeats within the window", async () => {
    expect(shouldLogThrottled("throttle-test", 50)).toBe(true);
    expect(shouldLogThrottled("throttle-test", 50)).toBe(false);
    expect(shouldLogThrottled("throttle-other", 50)).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(shouldLogThrottled("throttle-test", 50)).toBe(true);
  });
});

describe("request logging hooks", () => {
  async function withApp(run: (baseUrl: string) => Promise<void>): Promise<void> {
    const app = new Elysia();
    registerRequestLogging(app);
    app.onError(({ code, set }) => {
      if (code === "NOT_FOUND") {
        set.status = 404;
        return { detail: "Not Found" };
      }
      set.status = 500;
      return { detail: "Internal error" };
    });
    app.get("/probe", async () => {
      await Promise.resolve();
      logger.child({ component: "probe" }).info({}, "probe.log");
      return { ok: true };
    });
    app.get("/explode", () => {
      throw new Error("boom");
    });
    app.get("/health", () => ({ status: "ok" }));

    await app.listen({ port: 0 });
    const baseUrl = `http://127.0.0.1:${app.server?.port}`;
    try {
      await run(baseUrl);
      await flush();
    } finally {
      await app.stop();
    }
  }

  test("echoes and propagates a sane inbound request id", async () => {
    await withApp(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/probe`, {
        headers: { "x-request-id": "test-request-1" },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("x-request-id")).toBe("test-request-1");

      // The deep service log picked the id up from the request context.
      const probe = await find("probe.log");
      expect(probe.requestId).toBe("test-request-1");

      const access = await find("http.request", (e) => e.path === "/probe");
      expect(access.requestId).toBe("test-request-1");
      expect(access.method).toBe("GET");
      expect(access.status).toBe(200);
      expect(typeof access.durationMs).toBe("number");
      expect(access.level).toBe(30);
    });
  });

  test("replaces a malformed inbound request id", async () => {
    await withApp(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/probe`, {
        headers: { "x-request-id": "not valid!" },
      });
      const assigned = response.headers.get("x-request-id") ?? "";
      expect(assigned).not.toBe("not valid!");
      expect(assigned).toMatch(/^[A-Za-z0-9._-]{8,128}$/);
    });
  });

  test("logs 5xx access lines at error level", async () => {
    await withApp(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/explode`);
      expect(response.status).toBe(500);

      const access = await find("http.request", (e) => e.path === "/explode");
      expect(access.status).toBe(500);
      expect(access.level).toBe(50);
      expect(access.severity).toBe("ERROR");
    });
  });

  test("skips health checks", async () => {
    await withApp(async (baseUrl) => {
      await fetch(`${baseUrl}/health`);
      // Absence assertion: give the access logger a beat so a stray line would surface.
      await new Promise((resolve) => setTimeout(resolve, 75));
      expect(all().some((e) => e.msg === "http.request" && e.path === "/health")).toBe(false);
    });
  });

  test("logs 404 access lines at debug level only", async () => {
    await withApp(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/missing`);
      expect(response.status).toBe(404);

      const access = await find("http.request", (e) => e.path === "/missing");
      expect(access.level).toBe(20);
      expect(access.severity).toBe("DEBUG");
    });

    // Scanner probes stay invisible at the production default (`info`).
    lines = [];
    await withApp(async (baseUrl) => {
      __setLogLevel("info");
      await fetch(`${baseUrl}/missing`);
      await new Promise((resolve) => setTimeout(resolve, 75));
      expect(all().some((e) => e.msg === "http.request" && e.path === "/missing")).toBe(false);
    });
  });
});

describe("publicErrorDetail", () => {
  test("never leaks server-error internals", () => {
    const err = new Error('relation "users" does not exist');
    expect(publicErrorDetail(err, 500)).toBe("Internal error");
    expect(publicErrorDetail({ nope: true }, 500)).toBe("Internal error");
  });

  test("keeps 4xx messages and the database timeout copy", () => {
    expect(publicErrorDetail(new Error("Business not found"), 404)).toBe("Business not found");
    const timeout = new Error("connect timed out");
    expect(publicErrorDetail(timeout, 500)).toContain("retry");
  });
});
