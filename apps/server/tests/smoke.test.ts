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
    const { closeRedis } = await import("../src/redis.js");
    closeRedis();
    const { closeDb } = await import("../src/db/client.js");
    await closeDb();
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
});
