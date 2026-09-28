import type { Elysia } from "elysia";

import { socketRoute, type SocketBridge } from "../http/websocket.js";

import { requireBusinessAccess } from "../auth/jwt.js";
import { logger, shouldLogThrottled } from "../http/logger.js";
import {
  getLiveSessionById,
  getPublicLiveSession,
  joinLiveRoom,
  listLiveMessages,
  liveRoomViewerCount,
  maybeLiveAiReply,
  postLiveMessage,
} from "../services/live.js";

const log = logger.child({ component: "live" });

export function registerLiveWebSocketRoutes(app: Elysia): void {
  app.ws(
    "/ws/live/:sessionId",
    socketRoute((socket: SocketBridge, { params, query, headers }) => {
    const sessionId = params.sessionId as string;
    const role = query.role === "host" ? "host" : "viewer";
    const displayName = (query.name ?? (role === "host" ? "Host" : "Guest")).slice(0, 80);

    void (async () => {
      try {
        if (role === "host") {
          const session = await getLiveSessionById(sessionId);
          if (!headers.authorization && query.token) {
            headers.authorization = `Bearer ${query.token}`;
          }
          await requireBusinessAccess({ headers }, session.business_id);
        } else {
          await getPublicLiveSession(sessionId);
        }

        joinLiveRoom(sessionId, role, socket);
        const history = await listLiveMessages(sessionId);
        if (socket.readyState === 1) {
          socket.send(JSON.stringify({ type: "chat.history", items: history }));
          socket.send(
            JSON.stringify({ type: "viewer.count", count: liveRoomViewerCount(sessionId) }),
          );
        }

        socket.on("message", (raw) => {
          void (async () => {
            try {
              const data = JSON.parse(String(raw)) as {
                type?: string;
                body?: string;
                name?: string;
                product_id?: string | null;
              };
              if (data.type !== "chat.send") return;
              const taggedProduct =
                typeof data.product_id === "string" && data.product_id.length > 0
                  ? data.product_id
                  : null;
              const message = await postLiveMessage({
                sessionId,
                role,
                displayName: (data.name ?? displayName).slice(0, 80),
                body: String(data.body ?? ""),
                productId: taggedProduct,
              });
              void maybeLiveAiReply(sessionId, message.body).catch((err) => {
                log.warn({ err, sessionId }, "live.ai_reply_failed");
              });
            } catch (err) {
              if (shouldLogThrottled(`live.chat_frame_failed:${sessionId}`)) {
                log.warn({ err, sessionId }, "live.chat_frame_failed");
              }
            }
          })();
        });
      } catch {
        socket.close(4404, "LIVE not found");
      }
    })();
    }),
  );
}
