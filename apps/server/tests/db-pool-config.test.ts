import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * TKT-019: Bun's SQL client `idleTimeout` / `maxLifetime` timers hard-fail
 * in-flight queries instead of draining them (oven-sh/bun#30646 — the fix PRs
 * are unmerged as of Bun 1.4.2). Production saw `ERR_POSTGRES_LIFETIME_TIMEOUT`
 * 500s until they were removed. This guard stops them from creeping back.
 */
describe("database pool configuration", () => {
  const files = ["../src/db/client.ts", "../src/db/login-db.ts"];

  for (const file of files) {
    test(`${file} does not set connection timers`, () => {
      const source = readFileSync(resolve(import.meta.dir, file), "utf8");
      // Strip line comments: they mention the option names on purpose.
      const code = source
        .split("\n")
        .map((line) => line.replace(/\/\/.*$/, ""))
        .join("\n");
      expect(code).not.toMatch(/\bmaxLifetime\s*:/);
      expect(code).not.toMatch(/\bidleTimeout\s*:/);
    });
  }
});
