import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { FastifyInstance, FastifyRequest } from "fastify";

const execFileAsync = promisify(execFile);
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const devVisionScript = join(repoRoot, "scripts/dev-vision.sh");
const visionLogPath = join(repoRoot, ".vision.log");

function isLocalDevRequest(request: FastifyRequest): boolean {
  const host = request.hostname;
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

export async function registerDevVisionRoutes(app: FastifyInstance): Promise<void> {
  if (process.env.NODE_ENV === "production") return;

  app.post("/dev/vision/restart", async (request, reply) => {
    if (!isLocalDevRequest(request)) {
      return reply.status(403).send({ detail: "Dev vision launcher is localhost-only." });
    }

    const body = request.body as { business_slug?: string };
    const businessSlug = String(body.business_slug ?? "").trim();
    if (!businessSlug) {
      return reply.status(400).send({ detail: "business_slug is required." });
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
      return reply.status(500).send({ detail: message });
    }
  });

  app.get("/dev/vision/status", async (request, reply) => {
    if (!isLocalDevRequest(request)) {
      return reply.status(403).send({ detail: "Dev vision launcher is localhost-only." });
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
      return reply.status(500).send({ detail: message });
    }
  });
}
