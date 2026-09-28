import { eq } from "drizzle-orm";
import { requireBusinessAccess, sendAuthError } from "../../auth/jwt.js";
import { db } from "../../db/client.js";
import { businesses } from "../../db/schema.js";
import { ALLOWED_IMAGE_TYPES, deleteFromStorage, MAX_UPLOAD_BYTES, uploadToStorage } from "../../storage/index.js";
import { logger } from "../../http/logger.js";
import { readUploadedFile } from "../../http/multipart.js";
import type { Elysia } from "elysia";
import { HEX_COLOR_RE, DISPLAY_ORIENTATIONS, KIOSK_UI_MODES, normalizeKioskUiMode } from "./shared.js";

export function normalizeGradientColor(value: string | undefined | null): string {
  if (value == null) return "";
  const cleaned = value.trim();
  if (!cleaned) return "";
  if (!HEX_COLOR_RE.test(cleaned)) {
    const err = new Error("Gradient color must be a hex value like #f1f5f9.") as Error & {
      statusCode: number;
    };
    err.statusCode = 400;
    throw err;
  }
  if (cleaned.length === 4) {
    return (`#${[...cleaned.slice(1)].map((c) => c + c).join("")}`).toLowerCase();
  }
  return cleaned.toLowerCase();
}

export function normalizeDisplayOrientation(value: string | undefined | null): string {
  if (value == null || !value.trim()) return "landscape";
  const cleaned = value.trim().toLowerCase();
  if (!DISPLAY_ORIENTATIONS.has(cleaned)) {
    const err = new Error("Display orientation must be portrait, landscape, or auto.") as Error & {
      statusCode: number;
    };
    err.statusCode = 400;
    throw err;
  }
  return cleaned;
}

export function parseKioskUiMode(value: string | undefined | null): "classic" | "studio" {
  if (value == null || !value.trim()) return "classic";
  const cleaned = value.trim().toLowerCase();
  if (!KIOSK_UI_MODES.has(cleaned)) {
    const err = new Error("Kiosk UI must be classic or studio.") as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }
  return cleaned as "classic" | "studio";
}

export function appearanceOut(business: typeof businesses.$inferSelect) {
  return {
    background_url: business.backgroundUrl || "",
    gradient_color: business.gradientColor || "",
    display_orientation: business.displayOrientation || "landscape",
    kiosk_ui_mode: normalizeKioskUiMode(business.kioskUiMode),
  };
}

export async function registerAdminAppearanceRoutes(app: Elysia): Promise<void> {
  app.get("/admin/businesses/:businessId/appearance", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      const business = await requireBusinessAccess(request, businessId);
      return appearanceOut(business);
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.patch("/admin/businesses/:businessId/appearance", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      const business = await requireBusinessAccess(request, businessId);
      const body = request.body as {
        gradient_color?: string | null;
        display_orientation?: string | null;
        kiosk_ui_mode?: string | null;
      };
      let gradientColor = business.gradientColor;
      let displayOrientation = business.displayOrientation;
      let kioskUiMode = business.kioskUiMode || "classic";
      if (body.gradient_color !== undefined) {
        gradientColor = normalizeGradientColor(body.gradient_color);
      }
      if (body.display_orientation !== undefined) {
        displayOrientation = normalizeDisplayOrientation(body.display_orientation);
      }
      if (body.kiosk_ui_mode !== undefined) {
        kioskUiMode = parseKioskUiMode(body.kiosk_ui_mode);
      }
      const [updated] = await db
        .update(businesses)
        .set({ gradientColor, displayOrientation, kioskUiMode })
        .where(eq(businesses.id, business.id))
        .returning();
      return appearanceOut(updated!);
    } catch (err) {
      if (err instanceof Error && "statusCode" in err) {
        return request.status((err as Error & { statusCode: number }).statusCode, {
          detail: err.message,
        });
      }
      return sendAuthError(request, err);
    }
  });

  app.post("/admin/businesses/:businessId/appearance/background", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      const business = await requireBusinessAccess(request, businessId);
      const data = readUploadedFile(request.body);
      if (!data) return request.status(400, { detail: "No file uploaded." });

      const contentType = (data.mimetype || "").toLowerCase();
      const extension = ALLOWED_IMAGE_TYPES[contentType];
      if (!extension) {
        return request.status(400, {
          detail: "Upload a PNG, JPG, WEBP, or GIF image for the voice page background.",
        });
      }

      const buffer = await data.toBuffer();
      if (!buffer.length) return request.status(400, { detail: "Uploaded file is empty." });
      if (buffer.length > MAX_UPLOAD_BYTES) {
        return request.status(400, { detail: "Background image must be 5 MB or smaller." });
      }

      await deleteFromStorage("backgrounds", business.id);
      const url = await uploadToStorage(
        "backgrounds",
        `${business.id}/background${extension}`,
        buffer,
        contentType,
      );

      const [updated] = await db
        .update(businesses)
        .set({ backgroundUrl: url })
        .where(eq(businesses.id, business.id))
        .returning();
      return appearanceOut(updated!);
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.delete("/admin/businesses/:businessId/appearance/background", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      const business = await requireBusinessAccess(request, businessId);

      try {
        await deleteFromStorage("backgrounds", business.id);
      } catch (storageErr) {
        logger.warn(
          { err: storageErr, businessId: business.id },
          "Background file delete failed; clearing database URL anyway",
        );
      }

      const [updated] = await db
        .update(businesses)
        .set({ backgroundUrl: "" })
        .where(eq(businesses.id, business.id))
        .returning();

      return appearanceOut(updated!);
    } catch (err) {
      return sendAuthError(request, err);
    }
  });
}
