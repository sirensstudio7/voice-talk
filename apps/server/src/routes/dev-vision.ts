import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { Elysia } from "elysia";
import type { AuthContext } from "../http/context.js";

const execFileAsync = promisify(execFile);
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const devVisionScript = join(repoRoot, "scripts/dev-vision.sh");
const visionLogPath = join(repoRoot, ".vision.log");

function isLocalDevRequest(request: AuthContext): boolean {
  const host = (request.headers.host ?? "").split(":")[0];
  return host === "localhost" || host === "127.0.0.1";
}

async function readLogTail(maxLines = 20): Promise<string[]> {
  try {
    const raw = await readFile(visionLogPath, "utf8");
    const lines = raw.trim().split("\n").filter(Boolean);
    return lines.slice(-maxLines);
  } catch {
    return [];
  }
}

export async function registerDevVisionRoutes(app: Elysia): Promise<void> {
  if (process.env.NODE_ENV === "production") return;

  app.post("/dev/vision/restart", async (request) => {
    if (!isLocalDevRequest(request)) {
      return request.status(403, { detail: "Dev vision launcher is localhost-only." });
    }

    const body = request.body as { business_slug?: string };
    const businessSlug = String(body.business_slug ?? "").trim();
    if (!businessSlug) {
      return request.status(400, { detail: "business_slug is required." });
    }

    try {
      const { stdout } = await execFileAsync("bash", [devVisionScript, "restart", businessSlug], {
        cwd: repoRoot,
        timeout: 30_000,
      });
      return {
        ok: true,
        business_slug: businessSlug,
        message: stdout.trim(),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to restart vision.";
      return request.status(500, { detail: message });
    }
  });

  app.get("/dev/vision/status", async (request) => {
    if (!isLocalDevRequest(request)) {
      return request.status(403, { detail: "Dev vision launcher is localhost-only." });
    }

    try {
      const { stdout } = await execFileAsync("bash", [devVisionScript, "status"], {
        cwd: repoRoot,
        timeout: 10_000,
      });
      const logTail = await readLogTail();
      return {
        ...JSON.parse(stdout.trim() || "{}"),
        log_tail: logTail,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to read vision status.";
      return request.status(500, { detail: message });
    }
  });
}
