import { getCurrentUser, sendAuthError } from "../../auth/jwt.js";
import { createTopupOrder, getVoiceMinuteWallet, listActiveTopupPackages, listUserTopupOrders, orderOut, packageOut } from "../../services/voice-minutes.js";
import { ALLOWED_IMAGE_TYPES, MAX_UPLOAD_BYTES, uploadToStorage } from "../../storage/index.js";
import { readUploadedFile } from "../../http/multipart.js";
import { nonEmptyString, optionalString } from "../../http/validation.js";
import { t, type Elysia } from "elysia";

export const voiceMinuteOrderBody = t.Object({
  package_id: nonEmptyString,
  payment_method: optionalString,
  payment_proof_url: optionalString,
  notes: optionalString,
});

export async function registerAdminVoiceMinuteRoutes(app: Elysia): Promise<void> {
  app.get("/admin/voice-minutes/wallet", async (request) => {
    try {
      const user = await getCurrentUser(request);
      return getVoiceMinuteWallet(user.id);
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.get("/admin/voice-minutes/packages", async (request) => {
    try {
      await getCurrentUser(request);
      const packages = await listActiveTopupPackages();
      return { items: packages.map(packageOut) };
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.get("/admin/voice-minutes/orders", async (request) => {
    try {
      const user = await getCurrentUser(request);
      const orders = await listUserTopupOrders(user.id);
      return { items: orders.map(orderOut) };
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.post("/admin/voice-minutes/payment-proof", async (request) => {
    try {
      const user = await getCurrentUser(request);
      const data = readUploadedFile(request.body);
      if (!data) return request.status(400, { detail: "No file uploaded." });
      const contentType = (data.mimetype || "").toLowerCase();
      const extension = ALLOWED_IMAGE_TYPES[contentType];
      if (!extension) {
        return request.status(400, { detail: "Upload a PNG, JPG, WEBP, or GIF image." });
      }
      const buffer = await data.toBuffer();
      if (!buffer.length) return request.status(400, { detail: "Uploaded file is empty." });
      if (buffer.length > MAX_UPLOAD_BYTES) {
        return request.status(400, { detail: "Payment proof must be 5 MB or smaller." });
      }
      const url = await uploadToStorage(
        "payment-proofs",
        `${user.id}/topup-${Date.now()}${extension}`,
        buffer,
        contentType,
      );
      return { url };
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.post("/admin/voice-minutes/orders", async (request) => {
    try {
      const user = await getCurrentUser(request);
      const body = request.body;
      const order = await createTopupOrder({
        userId: user.id,
        packageId: body.package_id,
        paymentMethod: body.payment_method,
        paymentProofUrl: body.payment_proof_url,
        notes: body.notes,
      });
      return request.status(201, orderOut(order));
    } catch (err) {
      if (err instanceof Error && "statusCode" in err) {
        return request.status((err as Error & { statusCode: number }).statusCode, {
          detail: err.message,
        });
      }
      return sendAuthError(request, err);
    }
  }, {
    body: voiceMinuteOrderBody,
  });
}
