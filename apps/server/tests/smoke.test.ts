import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Elysia } from "elysia";

/**
 * End-to-end smoke test. Boots the real app against DATABASE_URL + REDIS_URL.
 *
 * Opt-in: requires SMOKE_TESTS=1 (plus the two URLs) so a plain `bun test`
 * never runs against a configured database by accident. The wrapper
 * `bun run test:with-services` provisions throwaway containers and sets it.
 *
 * Expectations: the database is migrated (scripts/migrate.ts) and seeded
 * (scripts/seed.ts): merchant `admin@sunrise.coffee` / `admin123` and the
 * platform admin from PLATFORM_ADMIN_EMAIL / PLATFORM_ADMIN_PASSWORD.
 */
const hasServices =
  process.env.SMOKE_TESTS === "1" && Boolean(process.env.DATABASE_URL && process.env.REDIS_URL);
const suite = hasServices ? describe : describe.skip;

const platformEmail = process.env.PLATFORM_ADMIN_EMAIL ?? "superadmin@lorescale.com";
const platformPassword = process.env.PLATFORM_ADMIN_PASSWORD ?? "superadmin123";

suite("api smoke", () => {
  let app: Elysia;
  let baseUrl: string;

  const api = (path: string, init?: RequestInit) => fetch(`${baseUrl}${path}`, init);

  const json = (body: unknown, token?: string): RequestInit => ({
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  beforeAll(async () => {
    const { buildApp } = await import("../src/app.js");
    app = await buildApp();
    await app.listen({ port: 0 });
    baseUrl = `http://127.0.0.1:${app.server?.port}`;
  });

  afterAll(async () => {
    await app?.stop();
    // Shared db/Redis clients stay open: test files run in one process and may
    // still be in flight. The runner exits the process when every file is done.
  });

  test("health reports db and redis online", async () => {
    const response = await api("/health?db=1");
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.status).toBe("ok");
    expect(body.db_online).toBe(true);
    expect(body.redis_online).toBe(true);
  });

  test("admin login: bad shape is rejected with a detail", async () => {
    const response = await api("/admin/auth/login", json({ email: 123, password: "admin123" }));
    expect(response.status).toBe(400);
    const body = (await response.json()) as { detail?: string };
    expect(body.detail).toContain("email");
  });

  test("admin login: wrong password is 401", async () => {
    const response = await api(
      "/admin/auth/login",
      json({ email: "admin@sunrise.coffee", password: "not-the-password" }),
    );
    expect(response.status).toBe(401);
  });

  test("admin login + read works", async () => {
    const login = await api(
      "/admin/auth/login",
      json({ email: "admin@sunrise.coffee", password: "admin123" }),
    );
    expect(login.status).toBe(200);
    const { access_token: token } = (await login.json()) as { access_token: string };
    expect(token).toBeTruthy();

    const businesses = await api("/admin/businesses", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(businesses.status).toBe(200);
    const rows = (await businesses.json()) as Array<{ id: string }>;
    expect(rows.length).toBeGreaterThan(0);

    const businessId = rows[0]!.id;
    const rejected = await api(
      `/admin/businesses/${businessId}/products`,
      json({ product_id: "smoke-bad", name: "Smoke", price: "abc", category: "x" }, token),
    );
    expect(rejected.status).toBe(400);
    const rejectedBody = (await rejected.json()) as { detail?: string };
    expect(rejectedBody.detail).toContain("price");

    const auth = { authorization: `Bearer ${token}` };
    const conversations = await api(
      `/admin/businesses/${businessId}/conversations?date=2026-01-01&tz_offset=420`,
      { headers: auth },
    );
    expect(conversations.status).toBe(200);

    const badLimit = await api(`/admin/businesses/${businessId}/photo/gallery?limit=abc`, {
      headers: auth,
    });
    expect(badLimit.status).toBe(400);
  });

  test("public menu responds", async () => {
    const response = await api("/menu?business=sunrise-coffee");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { slug?: string };
    expect(body.slug).toBe("sunrise-coffee");
  });

  test("public menu keeps the kiosk contract", async () => {
    const response = await api("/menu?business=sunrise-coffee");
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;

    for (const key of [
      "business",
      "slug",
      "assistant_name",
      "capabilities",
      "vision",
      "smart_photo_moment",
      "lucky_spin",
      "campaign_banner",
      "languages",
      "booking",
      "products",
    ]) {
      expect(body).toHaveProperty(key);
    }

    expect(Array.isArray(body.products)).toBe(true);
    const capabilities = body.capabilities as Record<string, unknown>;
    expect(typeof capabilities.ordering_enabled).toBe("boolean");
    expect(typeof capabilities.booking_enabled).toBe("boolean");

    const vision = body.vision as Record<string, unknown>;
    expect(typeof vision.greeting_trigger_mode).toBe("string");
    expect(typeof vision.silence_timeout_seconds).toBe("number");

    const smartPhoto = body.smart_photo_moment as Record<string, unknown>;
    expect(typeof smartPhoto.active).toBe("boolean");

    const luckySpin = body.lucky_spin as Record<string, unknown>;
    expect(typeof luckySpin.active).toBe("boolean");
    expect(typeof luckySpin.enabled).toBe("boolean");

    const banner = body.campaign_banner as Record<string, unknown>;
    expect(typeof banner.active).toBe("boolean");

    const languages = body.languages as Record<string, unknown>;
    expect(typeof languages.active).toBe("boolean");
    expect(Array.isArray(languages.available)).toBe(true);

    const booking = body.booking as Record<string, unknown>;
    expect(typeof booking.active).toBe("boolean");
    expect(Array.isArray(booking.staff)).toBe(true);
    expect(Array.isArray(booking.services)).toBe(true);
  });

  test("order confirm is idempotent per Idempotency-Key", async () => {
    const menuResponse = await api("/menu?business=sunrise-coffee");
    const menu = (await menuResponse.json()) as { products: Array<{ id: string }> };
    const productId = menu.products[0]?.id;
    expect(productId).toBeTruthy();

    const key = `smoke-${crypto.randomUUID()}`;
    const body = JSON.stringify({ items: [{ product_id: productId, quantity: 1 }] });
    const confirm = (idemKey?: string) =>
      api("/businesses/sunrise-coffee/orders/confirm", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(idemKey ? { "idempotency-key": idemKey } : {}),
        },
        body,
      });

    const first = await confirm(key);
    expect(first.status).toBe(200);
    const firstOrder = (await first.json()) as { id: string };

    // A retry with the same key returns the same order, not a duplicate.
    const second = await confirm(key);
    expect(second.status).toBe(200);
    const secondOrder = (await second.json()) as { id: string };
    expect(secondOrder.id).toBe(firstOrder.id);

    // Supplied but malformed keys are rejected instead of silently ignored.
    const bad = await confirm("short");
    expect(bad.status).toBe(400);
  });

  test("platform login + read works", async () => {
    const login = await api(
      "/platform/auth/login",
      json({ email: platformEmail, password: platformPassword }),
    );
    expect(login.status).toBe(200);
    const { access_token: token } = (await login.json()) as { access_token: string };

    const pricing = await api("/platform/pricing", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(pricing.status).toBe(200);
    const body = (await pricing.json()) as { plans: unknown[] };
    expect(Array.isArray(body.plans)).toBe(true);
  });

  test("query validation: numeric pagination is coerced, junk is rejected", async () => {
    const login = await api(
      "/platform/auth/login",
      json({ email: platformEmail, password: platformPassword }),
    );
    const { access_token: token } = (await login.json()) as { access_token: string };
    const headers = { authorization: `Bearer ${token}` };

    const ok = await api("/platform/users?page=1&limit=5", { headers });
    expect(ok.status).toBe(200);

    const bad = await api("/platform/users?page=abc", { headers });
    expect(bad.status).toBe(400);
    const badBody = (await bad.json()) as { detail?: string };
    expect(badBody.detail).toContain("page");
  });

  test("public kiosk unlock requires a pin", async () => {
    const response = await api("/public/kiosks/unlock", json({ business: "sunrise-coffee" }));
    expect(response.status).toBe(400);
  });

  test("request logging: echoes x-request-id and emits an access line", async () => {
    const { __setLogLevel, __setLogSink } = await import("../src/http/logger.js");
    const lines: string[] = [];
    __setLogSink((line) => lines.push(line));
    __setLogLevel("debug");
    try {
      const response = await api("/menu?business=sunrise-coffee", {
        headers: { "x-request-id": "smoke-request-1" },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("x-request-id")).toBe("smoke-request-1");

      // onAfterResponse runs from a setImmediate — let it land.
      await new Promise((resolve) => setTimeout(resolve, 25));
      const access = lines
        .map((line) => JSON.parse(line) as Record<string, unknown>)
        .find((entry) => entry.msg === "http.request" && entry.path === "/menu");
      expect(access).toBeDefined();
      expect(access!.requestId).toBe("smoke-request-1");
      expect(access!.status).toBe(200);
    } finally {
      __setLogSink(null);
      __setLogLevel(null);
    }
  });
});
