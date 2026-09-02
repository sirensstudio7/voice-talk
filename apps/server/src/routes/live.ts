import type { Elysia } from "elysia";

import { requireBusinessAccess, sendAuthError } from "../auth/jwt.js";
import {
  createLiveDedicatedProduct,
  createLiveKnowledge,
  createLiveSession,
  deleteLiveDedicatedProduct,
  deleteLiveKnowledge,
  endLiveSession,
  getLiveSessionForBusiness,
  getPublicLiveSession,
  listLiveKnowledge,
  listLiveMessages,
  listLiveProductCatalog,
  listLiveSessionOrders,
  listLiveSessions,
  confirmLiveOrder,
  setLiveSessionProducts,
  startLiveSession,
  updateLiveDedicatedProduct,
  updateLiveKnowledge,
} from "../services/live.js";

function statusFromError(err: unknown): number {
  if (err && typeof err === "object" && "statusCode" in err) {
    return Number((err as { statusCode?: number }).statusCode) || 500;
  }
  return 500;
}

export async function registerLiveRoutes(app: Elysia): Promise<void> {
  app.get("/admin/businesses/:businessId/live/sessions", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      return { items: await listLiveSessions(businessId) };
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.post("/admin/businesses/:businessId/live/sessions", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      const body = (request.body ?? {}) as { title?: string; product_ids?: string[] };
      const created = await createLiveSession(businessId, {
        title: String(body.title ?? ""),
        product_ids: body.product_ids,
      });
      return request.status(201, created);
    } catch (err) {
      const status = statusFromError(err);
      if (status === 401 || status === 403) return sendAuthError(request, err);
      return request.status(status, {
        detail: err instanceof Error ? err.message : "Failed to create LIVE",
      });
    }
  });

  app.get("/admin/businesses/:businessId/live/catalog", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      return { items: await listLiveProductCatalog(businessId) };
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.get("/admin/businesses/:businessId/live/sessions/:sessionId", async (request) => {
    try {
      const { businessId, sessionId } = request.params as {
        businessId: string;
        sessionId: string;
      };
      await requireBusinessAccess(request, businessId);
      return getLiveSessionForBusiness(businessId, sessionId);
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.get(
    "/admin/businesses/:businessId/live/sessions/:sessionId/orders",
    async (request) => {
      try {
        const { businessId, sessionId } = request.params as {
          businessId: string;
          sessionId: string;
        };
        await requireBusinessAccess(request, businessId);
        return { items: await listLiveSessionOrders(businessId, sessionId) };
      } catch (err) {
        return sendAuthError(request, err);
      }
    },
  );

  app.post(
    "/admin/businesses/:businessId/live/sessions/:sessionId/dedicated-products",
    async (request) => {
      try {
        const { businessId, sessionId } = request.params as {
          businessId: string;
          sessionId: string;
        };
        await requireBusinessAccess(request, businessId);
        const body = (request.body ?? {}) as {
          name?: string;
          price?: number;
          product_id?: string;
          discount_percent?: number;
          category?: string;
          description?: string;
          image_url?: string;
        };
        const next = await createLiveDedicatedProduct(businessId, sessionId, {
          name: String(body.name ?? ""),
          price: Number(body.price),
          product_id: String(body.product_id ?? ""),
          discount_percent: Number(body.discount_percent ?? 0),
          category: String(body.category ?? ""),
          description: String(body.description ?? ""),
          image_url: String(body.image_url ?? ""),
        });
        return request.status(201, next);
      } catch (err) {
        const status = statusFromError(err);
        if (status === 401 || status === 403) return sendAuthError(request, err);
        return request.status(status, {
          detail: err instanceof Error ? err.message : "Failed to add LIVE product",
        });
      }
    },
  );

  app.patch("/admin/businesses/:businessId/live/catalog/:productRowId", async (request) => {
    try {
      const { businessId, productRowId } = request.params as {
        businessId: string;
        productRowId: string;
      };
      await requireBusinessAccess(request, businessId);
      const body = (request.body ?? {}) as {
        name?: string;
        price?: number;
        product_id?: string;
        discount_percent?: number;
        category?: string;
        description?: string;
        image_url?: string;
      };
      return updateLiveDedicatedProduct(businessId, productRowId, {
        name: String(body.name ?? ""),
        price: Number(body.price),
        product_id: String(body.product_id ?? ""),
        discount_percent: Number(body.discount_percent ?? 0),
        category: String(body.category ?? ""),
        description: String(body.description ?? ""),
        image_url: String(body.image_url ?? ""),
      });
    } catch (err) {
      const status = statusFromError(err);
      if (status === 401 || status === 403) return sendAuthError(request, err);
      return request.status(status, {
        detail: err instanceof Error ? err.message : "Failed to update LIVE product",
      });
    }
  });

  app.delete("/admin/businesses/:businessId/live/catalog/:productRowId", async (request) => {
    try {
      const { businessId, productRowId } = request.params as {
        businessId: string;
        productRowId: string;
      };
      await requireBusinessAccess(request, businessId);
      await deleteLiveDedicatedProduct(businessId, productRowId);
      return { ok: true };
    } catch (err) {
      const status = statusFromError(err);
      if (status === 401 || status === 403) return sendAuthError(request, err);
      return request.status(status, {
        detail: err instanceof Error ? err.message : "Failed to delete LIVE product",
      });
    }
  });

  app.put(
    "/admin/businesses/:businessId/live/sessions/:sessionId/products",
    async (request) => {
      try {
        const { businessId, sessionId } = request.params as {
          businessId: string;
          sessionId: string;
        };
        await requireBusinessAccess(request, businessId);
        const body = (request.body ?? {}) as { product_ids?: string[] };
        return setLiveSessionProducts(businessId, sessionId, body.product_ids ?? []);
      } catch (err) {
        const status = statusFromError(err);
        if (status === 401 || status === 403) return sendAuthError(request, err);
        return request.status(status, {
          detail: err instanceof Error ? err.message : "Failed to update products",
        });
      }
    },
  );

  app.post(
    "/admin/businesses/:businessId/live/sessions/:sessionId/start",
    async (request) => {
      try {
        const { businessId, sessionId } = request.params as {
          businessId: string;
          sessionId: string;
        };
        await requireBusinessAccess(request, businessId);
        return startLiveSession(businessId, sessionId);
      } catch (err) {
        const status = statusFromError(err);
        if (status === 401 || status === 403) return sendAuthError(request, err);
        return request.status(status, {
          detail: err instanceof Error ? err.message : "Failed to start LIVE",
        });
      }
    },
  );

  app.post(
    "/admin/businesses/:businessId/live/sessions/:sessionId/end",
    async (request) => {
      try {
        const { businessId, sessionId } = request.params as {
          businessId: string;
          sessionId: string;
        };
        await requireBusinessAccess(request, businessId);
        return endLiveSession(businessId, sessionId);
      } catch (err) {
        const status = statusFromError(err);
        if (status === 401 || status === 403) return sendAuthError(request, err);
        return request.status(status, {
          detail: err instanceof Error ? err.message : "Failed to end LIVE",
        });
      }
    },
  );

  app.get(
    "/admin/businesses/:businessId/live/sessions/:sessionId/messages",
    async (request) => {
      try {
        const { businessId, sessionId } = request.params as {
          businessId: string;
          sessionId: string;
        };
        await requireBusinessAccess(request, businessId);
        await getLiveSessionForBusiness(businessId, sessionId);
        return { items: await listLiveMessages(sessionId) };
      } catch (err) {
        return sendAuthError(request, err);
      }
    },
  );

  app.get(
    "/admin/businesses/:businessId/live/sessions/:sessionId/knowledge",
    async (request) => {
      try {
        const { businessId, sessionId } = request.params as {
          businessId: string;
          sessionId: string;
        };
        await requireBusinessAccess(request, businessId);
        return { items: await listLiveKnowledge(businessId, sessionId) };
      } catch (err) {
        return sendAuthError(request, err);
      }
    },
  );

  app.post(
    "/admin/businesses/:businessId/live/sessions/:sessionId/knowledge",
    async (request) => {
      try {
        const { businessId, sessionId } = request.params as {
          businessId: string;
          sessionId: string;
        };
        await requireBusinessAccess(request, businessId);
        const body = (request.body ?? {}) as { title?: string; content?: string };
        const created = await createLiveKnowledge(businessId, sessionId, {
          title: body.title,
          content: String(body.content ?? ""),
        });
        return request.status(201, created);
      } catch (err) {
        const status = statusFromError(err);
        if (status === 401 || status === 403) return sendAuthError(request, err);
        return request.status(status, {
          detail: err instanceof Error ? err.message : "Failed to add talking point",
        });
      }
    },
  );

  app.patch(
    "/admin/businesses/:businessId/live/sessions/:sessionId/knowledge/:entryId",
    async (request) => {
      try {
        const { businessId, sessionId, entryId } = request.params as {
          businessId: string;
          sessionId: string;
          entryId: string;
        };
        await requireBusinessAccess(request, businessId);
        const body = (request.body ?? {}) as { title?: string; content?: string };
        return updateLiveKnowledge(businessId, sessionId, entryId, body);
      } catch (err) {
        const status = statusFromError(err);
        if (status === 401 || status === 403) return sendAuthError(request, err);
        return request.status(status, {
          detail: err instanceof Error ? err.message : "Failed to update talking point",
        });
      }
    },
  );

  app.delete(
    "/admin/businesses/:businessId/live/sessions/:sessionId/knowledge/:entryId",
    async (request) => {
      try {
        const { businessId, sessionId, entryId } = request.params as {
          businessId: string;
          sessionId: string;
          entryId: string;
        };
        await requireBusinessAccess(request, businessId);
        await deleteLiveKnowledge(businessId, sessionId, entryId);
        return request.status(204, );
      } catch (err) {
        return sendAuthError(request, err);
      }
    },
  );

  app.get("/live/sessions/:sessionId", async (request) => {
    try {
      const { sessionId } = request.params as { sessionId: string };
      const session = await getPublicLiveSession(sessionId);
      const messages = await listLiveMessages(sessionId);
      return { session, messages };
    } catch (err) {
      const status = statusFromError(err);
      return request.status(status, {
        detail: err instanceof Error ? err.message : "LIVE not found",
      });
    }
  });

  app.post("/live/sessions/:sessionId/orders", async (request) => {
    try {
      const { sessionId } = request.params as { sessionId: string };
      const body = (request.body ?? {}) as {
        items?: Array<{ product_id: string; quantity: number }>;
        customer_name?: string;
        customer_phone?: string;
        customer_address?: string;
        customer_notes?: string;
      };
      const created = await confirmLiveOrder(sessionId, {
        items: Array.isArray(body.items) ? body.items : [],
        customer_name: body.customer_name,
        customer_phone: body.customer_phone,
        customer_address: body.customer_address,
        customer_notes: body.customer_notes,
      });
      return request.status(201, created);
    } catch (err) {
      const status = statusFromError(err);
      return request.status(status, {
        detail: err instanceof Error ? err.message : "Failed to confirm LIVE order",
      });
    }
  });
}
