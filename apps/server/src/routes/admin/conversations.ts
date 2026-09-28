import { mergeTranscriptMessages } from "@voicetalk/shared";
import { and, count, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { requireBusinessAccess, sendAuthError } from "../../auth/jwt.js";
import { db } from "../../db/client.js";
import { orderItems, orders, transcriptMessages, voiceSessions, kioskDisplays } from "../../db/schema.js";
import { optionalString, queryNumber } from "../../http/validation.js";
import { endVoiceSession } from "../../services/order-persistence.js";
import { publishKioskPayload } from "../../services/kiosk-bus.js";
import { safeDebitEndedSession } from "../../services/voice-minutes.js";
import { forceCompleteVoiceSession } from "../../services/voice-session-runtime.js";
import { serializeUtcDatetime } from "../../services/pricing.js";
import { orderToOut } from "../public.js";
import { t, type Elysia } from "elysia";
import type { ConversationSessionRow, ConversationKioskOut } from "./shared.js";

export function parseDateFilter(date: string, tzOffset?: number) {
  const day = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(day.getTime())) {
    const err = new Error("Invalid date format. Use YYYY-MM-DD.") as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }
  const offset = tzOffset ?? 0;
  const start = new Date(day.getTime() + offset * 60 * 1000);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

export type ConversationMessageRow = typeof transcriptMessages.$inferSelect;

export type ConversationOrderRow = typeof orders.$inferSelect;

export function conversationSummaryOut(
  session: ConversationSessionRow,
  extras: {
    messageCount: number;
    orderId: string | null;
    orderTotal: number | null;
    kiosk?: ConversationKioskOut | null;
  },
) {
  const duration =
    session.endedAt != null
      ? Math.floor((session.endedAt.getTime() - session.startedAt.getTime()) / 1000)
      : null;

  return {
    id: session.id,
    status: session.status,
    started_at: serializeUtcDatetime(session.startedAt),
    ended_at: session.endedAt ? serializeUtcDatetime(session.endedAt) : null,
    end_reason: session.endReason ?? null,
    duration_seconds: duration,
    message_count: extras.messageCount,
    order_id: extras.orderId,
    order_total: extras.orderTotal,
    kiosk_display_id: extras.kiosk?.id ?? session.kioskDisplayId ?? null,
    kiosk_display_name: extras.kiosk?.name ?? null,
    kiosk_display_slug: extras.kiosk?.slug ?? null,
  };
}

export function voiceSessionsListWhere(
  businessId: string,
  filterStart: Date | null,
  filterEnd: Date | null,
  kioskDisplayId: string | null,
) {
  const conditions = [eq(voiceSessions.businessId, businessId)];
  if (filterStart && filterEnd) {
    conditions.push(gte(voiceSessions.startedAt, filterStart));
    conditions.push(lt(voiceSessions.startedAt, filterEnd));
  }
  if (kioskDisplayId) {
    conditions.push(eq(voiceSessions.kioskDisplayId, kioskDisplayId));
  }
  return and(...conditions);
}

export async function loadKioskDisplayMapForSessions(
  sessions: ConversationSessionRow[],
): Promise<Map<string, ConversationKioskOut>> {
  const displayIds = [
    ...new Set(
      sessions.map((session) => session.kioskDisplayId).filter((id): id is string => Boolean(id)),
    ),
  ];
  if (displayIds.length === 0) return new Map();

  const rows = await db
    .select({
      id: kioskDisplays.id,
      name: kioskDisplays.name,
      slug: kioskDisplays.slug,
    })
    .from(kioskDisplays)
    .where(inArray(kioskDisplays.id, displayIds));

  return new Map(rows.map((row) => [row.id, row]));
}

export function buildConversationDetail(
  session: ConversationSessionRow,
  messages: ConversationMessageRow[],
  order: ConversationOrderRow | undefined,
  kiosk?: ConversationKioskOut | null,
) {
  const mappedMessages = messages.map((m) => ({
    id: m.id,
    role: m.role,
    text: m.text,
    created_at: serializeUtcDatetime(m.createdAt),
  }));
  const mergedMessages = mergeTranscriptMessages(mappedMessages);

  return {
    ...conversationSummaryOut(session, {
      messageCount: mergedMessages.length,
      orderId: order?.id ?? null,
      orderTotal: order?.total ?? null,
      kiosk,
    }),
    messages: mergedMessages,
  };
}

export async function loadKioskForSession(
  session: ConversationSessionRow,
): Promise<ConversationKioskOut | null> {
  if (!session.kioskDisplayId) return null;
  const map = await loadKioskDisplayMapForSessions([session]);
  return map.get(session.kioskDisplayId) ?? null;
}

export const conversationQuery = t.Object({
  date: optionalString,
  tz_offset: queryNumber,
  kiosk_display_id: optionalString,
});

export async function registerAdminConversationRoutes(app: Elysia): Promise<void> {
  app.get("/admin/businesses/:businessId/orders", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      const query = request.query;
      let filterStart: Date | null = null;
      let filterEnd: Date | null = null;
      if (query.date) {
        const { start, end } = parseDateFilter(query.date, query.tz_offset ?? 0);
        filterStart = start;
        filterEnd = end;
      }

      let rows = await db
        .select()
        .from(orders)
        .where(eq(orders.businessId, businessId))
        .orderBy(desc(orders.createdAt))
        .limit(200);

      if (filterStart && filterEnd) {
        rows = rows.filter((o) => o.createdAt >= filterStart! && o.createdAt < filterEnd!);
      }

      const orderIds = rows.map((order) => order.id);
      const itemsByOrderId = new Map<string, (typeof orderItems.$inferSelect)[]>();

      if (orderIds.length) {
        const items = await db
          .select()
          .from(orderItems)
          .where(inArray(orderItems.orderId, orderIds));
        for (const item of items) {
          const existing = itemsByOrderId.get(item.orderId) ?? [];
          existing.push(item);
          itemsByOrderId.set(item.orderId, existing);
        }
      }

      return rows.map((order) =>
        orderToOut({ ...order, items: itemsByOrderId.get(order.id) ?? [] }),
      );
    } catch (err) {
      if (err instanceof Error && "statusCode" in err) {
        return request.status((err as Error & { statusCode: number }).statusCode, {
          detail: err.message,
        });
      }
      return sendAuthError(request, err);
    }
  }, {
    query: conversationQuery,
  });

  app.get("/admin/businesses/:businessId/conversations", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      const query = request.query;
      let filterStart: Date | null = null;
      let filterEnd: Date | null = null;
      if (query.date) {
        const { start, end } = parseDateFilter(query.date, query.tz_offset ?? 0);
        filterStart = start;
        filterEnd = end;
      }
      const kioskDisplayId = query.kiosk_display_id?.trim() || null;

      const sessions = await db
        .select()
        .from(voiceSessions)
        .where(voiceSessionsListWhere(businessId, filterStart, filterEnd, kioskDisplayId))
        .orderBy(desc(voiceSessions.startedAt))
        .limit(200);

      const kioskById = await loadKioskDisplayMapForSessions(sessions);
      const sessionIds = sessions.map((s) => s.id);
      const messageCounts = new Map<string, number>();
      const orderBySessionId = new Map<string, (typeof orders.$inferSelect)>();

      if (sessionIds.length) {
        const [counts, sessionOrders] = await Promise.all([
          db
            .select({
              voiceSessionId: transcriptMessages.voiceSessionId,
              count: count(),
            })
            .from(transcriptMessages)
            .where(inArray(transcriptMessages.voiceSessionId, sessionIds))
            .groupBy(transcriptMessages.voiceSessionId),
          db
            .select()
            .from(orders)
            .where(inArray(orders.voiceSessionId, sessionIds)),
        ]);

        for (const row of counts) {
          messageCounts.set(row.voiceSessionId, Number(row.count));
        }
        for (const order of sessionOrders) {
          if (order.voiceSessionId && !orderBySessionId.has(order.voiceSessionId)) {
            orderBySessionId.set(order.voiceSessionId, order);
          }
        }
      }

      return sessions.map((session) => {
        const order = orderBySessionId.get(session.id);
        const kiosk = session.kioskDisplayId
          ? (kioskById.get(session.kioskDisplayId) ?? null)
          : null;
        return conversationSummaryOut(session, {
          messageCount: messageCounts.get(session.id) ?? 0,
          orderId: order?.id ?? null,
          orderTotal: order?.total ?? null,
          kiosk,
        });
      });
    } catch (err) {
      if (err instanceof Error && "statusCode" in err) {
        return request.status((err as Error & { statusCode: number }).statusCode, {
          detail: err.message,
        });
      }
      return sendAuthError(request, err);
    }
  }, {
    query: conversationQuery,
  });

  app.get("/admin/businesses/:businessId/conversations/export", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      const query = request.query;
      let filterStart: Date | null = null;
      let filterEnd: Date | null = null;
      if (query.date) {
        const { start, end } = parseDateFilter(query.date, query.tz_offset ?? 0);
        filterStart = start;
        filterEnd = end;
      }
      const kioskDisplayId = query.kiosk_display_id?.trim() || null;

      const sessions = await db
        .select()
        .from(voiceSessions)
        .where(voiceSessionsListWhere(businessId, filterStart, filterEnd, kioskDisplayId))
        .orderBy(desc(voiceSessions.startedAt))
        .limit(200);

      const kioskById = await loadKioskDisplayMapForSessions(sessions);
      const sessionIds = sessions.map((session) => session.id);
      if (sessionIds.length === 0) return [];

      const [messages, sessionOrders] = await Promise.all([
        db
          .select()
          .from(transcriptMessages)
          .where(inArray(transcriptMessages.voiceSessionId, sessionIds))
          .orderBy(transcriptMessages.createdAt),
        db.select().from(orders).where(inArray(orders.voiceSessionId, sessionIds)),
      ]);

      const messagesBySessionId = new Map<string, ConversationMessageRow[]>();
      for (const message of messages) {
        const existing = messagesBySessionId.get(message.voiceSessionId) ?? [];
        existing.push(message);
        messagesBySessionId.set(message.voiceSessionId, existing);
      }

      const orderBySessionId = new Map<string, ConversationOrderRow>();
      for (const order of sessionOrders) {
        if (order.voiceSessionId && !orderBySessionId.has(order.voiceSessionId)) {
          orderBySessionId.set(order.voiceSessionId, order);
        }
      }

      return sessions.map((session) => {
        const kiosk = session.kioskDisplayId
          ? (kioskById.get(session.kioskDisplayId) ?? null)
          : null;
        return buildConversationDetail(
          session,
          messagesBySessionId.get(session.id) ?? [],
          orderBySessionId.get(session.id),
          kiosk,
        );
      });
    } catch (err) {
      if (err instanceof Error && "statusCode" in err) {
        return request.status((err as Error & { statusCode: number }).statusCode, {
          detail: err.message,
        });
      }
      return sendAuthError(request, err);
    }
  }, {
    query: conversationQuery,
  });

  app.get("/admin/businesses/:businessId/conversations/:sessionId", async (request) => {
    try {
      const { businessId, sessionId } = request.params as {
        businessId: string;
        sessionId: string;
      };
      await requireBusinessAccess(request, businessId);
      const session = await db.query.voiceSessions.findFirst({
        where: and(eq(voiceSessions.id, sessionId), eq(voiceSessions.businessId, businessId)),
      });
      if (!session) return request.status(404, { detail: "Conversation not found" });

      const messages = await db
        .select()
        .from(transcriptMessages)
        .where(eq(transcriptMessages.voiceSessionId, sessionId))
        .orderBy(transcriptMessages.createdAt);

      const sessionOrders = await db
        .select()
        .from(orders)
        .where(eq(orders.voiceSessionId, sessionId))
        .limit(1);

      const kiosk = await loadKioskForSession(session);
      return buildConversationDetail(session, messages, sessionOrders[0], kiosk);
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.post("/admin/businesses/:businessId/conversations/:sessionId/end", async (request) => {
    try {
      const { businessId, sessionId } = request.params as {
        businessId: string;
        sessionId: string;
      };
      const business = await requireBusinessAccess(request, businessId);
      const session = await db.query.voiceSessions.findFirst({
        where: and(eq(voiceSessions.id, sessionId), eq(voiceSessions.businessId, businessId)),
      });
      if (!session) return request.status(404, { detail: "Conversation not found" });

      if (!session.endedAt) {
        const live = forceCompleteVoiceSession(sessionId, "admin");
        await endVoiceSession(sessionId, "admin");
        // Live sockets debit in websocket teardown. Debit here only for orphan rows.
        if (!live) {
          await safeDebitEndedSession(sessionId);
          // The socket may be pinned to another instance: ask every instance to
          // wrap the session up (TKT-004).
          await publishKioskPayload(business.slug, {
            type: "voice.force_end",
            voiceSessionId: sessionId,
            reason: "admin",
          });
        }
      }

      const ended = await db.query.voiceSessions.findFirst({
        where: and(eq(voiceSessions.id, sessionId), eq(voiceSessions.businessId, businessId)),
      });
      if (!ended) return request.status(404, { detail: "Conversation not found" });

      const [counts, sessionOrders] = await Promise.all([
        db
          .select({ count: count() })
          .from(transcriptMessages)
          .where(eq(transcriptMessages.voiceSessionId, sessionId)),
        db.select().from(orders).where(eq(orders.voiceSessionId, sessionId)).limit(1),
      ]);
      const order = sessionOrders[0];
      const kiosk = await loadKioskForSession(ended);
      return conversationSummaryOut(ended, {
        messageCount: Number(counts[0]?.count ?? 0),
        orderId: order?.id ?? null,
        orderTotal: order?.total ?? null,
        kiosk,
      });
    } catch (err) {
      if (err instanceof Error && "statusCode" in err) {
        return request.status((err as Error & { statusCode: number }).statusCode, {
          detail: err.message,
        });
      }
      return sendAuthError(request, err);
    }
  });
}
