import { describe, expect, test } from "bun:test";
import { Elysia, t } from "elysia";
import { numberLike, optionalNullableString, validationDetail } from "../src/http/validation.js";

/**
 * Unit tests for the validation primitives. These run without Postgres or
 * Redis: the schemas are exercised on a throwaway Elysia instance.
 */
async function withApp<T>(
  route: (app: Elysia) => Elysia,
  run: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const app = new Elysia();
  app.onError(({ error, code, set }) => {
    if (code === "VALIDATION") {
      set.status = 400;
      return { detail: validationDetail(error) };
    }
  });
  route(app);
  await app.listen({ port: 0 });
  const baseUrl = `http://127.0.0.1:${app.server?.port}`;
  try {
    return await run(baseUrl);
  } finally {
    await app.stop();
  }
}

async function postJson(
  baseUrl: string,
  path: string,
  body: unknown,
): Promise<{ status: number; json: unknown }> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, json: text ? JSON.parse(text) : null };
}

describe("numberLike", () => {
  test("accepts numbers and numeric strings", async () => {
    await withApp(
      (app) => app.post("/n", ({ body }) => body, { body: t.Object({ n: numberLike }) }),
      async (baseUrl) => {
        expect((await postJson(baseUrl, "/n", { n: 12 })).status).toBe(200);
        expect((await postJson(baseUrl, "/n", { n: -3.5 })).status).toBe(200);
        expect((await postJson(baseUrl, "/n", { n: "45000" })).status).toBe(200);
      },
    );
  });

  test("rejects non-numeric values", async () => {
    await withApp(
      (app) => app.post("/n", ({ body }) => body, { body: t.Object({ n: numberLike }) }),
      async (baseUrl) => {
        expect((await postJson(baseUrl, "/n", { n: "abc" })).status).toBe(400);
        expect((await postJson(baseUrl, "/n", { n: true })).status).toBe(400);
      },
    );
  });
});

describe("optionalNullableString", () => {
  test("accepts string, null, and omission inside an object body", async () => {
    await withApp(
      (app) =>
        app.post("/s", ({ body }) => body, {
          body: t.Object({ v: optionalNullableString }),
        }),
      async (baseUrl) => {
        expect((await postJson(baseUrl, "/s", { v: "hello" })).status).toBe(200);
        expect((await postJson(baseUrl, "/s", { v: null })).status).toBe(200);
        expect((await postJson(baseUrl, "/s", {})).status).toBe(200);
        expect((await postJson(baseUrl, "/s", { v: 5 })).status).toBe(400);
      },
    );
  });
});

describe("validationDetail", () => {
  test("renders the first issue as a detail string", () => {
    const error = {
      all: [{ path: "/items/0/product_id", message: "Expected string" }],
    };
    expect(validationDetail(error)).toBe("items.0.product_id: Expected string");
  });

  test("falls back when no issues are present", () => {
    expect(validationDetail({})).toBe("Invalid request.");
  });
});
