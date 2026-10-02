import { beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import type { Elysia } from "elysia";

/**
 * TKT-003: unauthenticated mutations are rate-limited per IP (and slug where
 * known). Opt-in like the smoke tests: SMOKE_TESTS=1 + DATABASE_URL + REDIS_URL.
 *
 * `x-forwarded-for` is spoofed with a unique test-net address per test so
 * reruns within one window cannot inherit a spent budget. Shared DB/Redis
 * clients are left open: every test file runs in one process and the smoke
 * suite owns teardown.
 */
const hasServices =
  process.env.SMOKE_TESTS === "1" && Boolean(process.env.DATABASE_URL && process.env.REDIS_URL);
const suite = hasServices ? describe : describe.skip;

function uniqueIp(): string {
  return `203.0.113.${1 + Math.floor(Math.random() * 250)}`;
}

suite("public rate limits", () => {
  let app: Elysia;
  let baseUrl: string;

  beforeAll(async () => {
    const { buildApp } = await import("../src/app.js");
    app = await buildApp();
    await app.listen({ port: 0 });
    baseUrl = `http://127.0.0.1:${app.server?.port}`;
  });

  const post = (path: string, body: unknown, ip: string) =>
    fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify(body),
    });

  test("helper denies past the limit and counts it per bucket", async () => {
    const { allowPublicRequest } = await import("../src/http/rate-limit.js");
    const { metricsSnapshot } = await import("../src/http/metrics.js");
    const bucket = `test_${randomUUID().slice(0, 8)}`;
    const rule = { bucket, limit: 2, windowMs: 60_000 };
    const request = {
      headers: { "x-forwarded-for": uniqueIp() },
      request: new Request("http://localhost/probe"),
      server: null,
    } as unknown as Parameters<typeof allowPublicRequest>[0];

    expect(await allowPublicRequest(request, rule)).toBe(true);
    expect(await allowPublicRequest(request, rule)).toBe(true);
    expect(await allowPublicRequest(request, rule)).toBe(false);

    const snapshot = metricsSnapshot();
    expect(snapshot["rate_limit.denied_total"]).toBeGreaterThan(0);
    expect(snapshot[`rate_limit.denied.${bucket}`]).toBe(1);
  });

  test("merchant login is limited per email+IP", async () => {
    const ip = uniqueIp();
    const email = `ratelimit-${randomUUID()}@example.test`;
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 11; attempt += 1) {
      const response = await post("/admin/auth/login", { email, password: "wrong-password" }, ip);
      statuses.push(response.status);
    }

    expect(statuses.slice(0, 10).every((status) => status === 401)).toBe(true);
    expect(statuses[10]).toBe(429);

    const health = await fetch(`${baseUrl}/health?metrics=1`);
    const body = (await health.json()) as { metrics?: Record<string, number> };
    expect(body.metrics?.["rate_limit.denied.merchant_login"]).toBeGreaterThan(0);
  });

  test("demo requests are capped per IP", async () => {
    const ip = uniqueIp();
    // A future date, computed rather than hardcoded: the route rejects past
    // dates, so a fixed literal goes stale and the test stops exercising 201s.
    const preferredDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const body = {
      email: `demo-${randomUUID()}@example.test`,
      phone: "+620000000000",
      company_name: "Rate Limit Probe",
      city: "Jakarta",
      country: "Indonesia",
      business_industry: "F&B",
      branch_total: 1,
      preferred_date: preferredDate,
      preferred_time: "10:00",
    };
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      statuses.push((await post("/public/demo-requests", body, ip)).status);
    }

    expect(statuses.slice(0, 5).every((status) => status === 201)).toBe(true);
    expect(statuses[5]).toBe(429);
  });

  test("lucky-spin spins are capped per IP+slug", async () => {
    const ip = uniqueIp();
    const statuses: number[] = [];
    let lastDetail = "";
    for (let attempt = 0; attempt < 31; attempt += 1) {
      const response = await post("/public/lucky-spin/sunrise-coffee/spin", {}, ip);
      statuses.push(response.status);
      if (attempt === 30) {
        lastDetail = ((await response.json()) as { detail?: string }).detail ?? "";
      }
    }

    expect(statuses[30]).toBe(429);
    expect(lastDetail).toContain("Too many requests");
  });
});
