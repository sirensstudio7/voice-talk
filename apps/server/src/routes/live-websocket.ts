import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";

import { requireBusinessAccess } from "../auth/jwt.js";
import {
  getLiveSessionById,
  getPublicLiveSession,
  joinLiveRoom,
  listLiveMessages,
  liveRoomViewerCount,
  maybeLiveAiReply,
  postLiveMessage,
} from "../services/live.js";

export async function registerLiveWebSocketRoutes(app: FastifyInstance): Promise<void> {
  app.get("/ws/live/:sessionId", { websocket: true }, (socket: WebSocket, request) => {
    const { sessionId } = request.params as { sessionId: string };
    const query = request.query as { role?: string; name?: string; token?: string };
    const role = query.role === "host" ? "host" : "viewer";
    const displayName = (query.name ?? (role === "host" ? "Host" : "Guest")).slice(0, 80);

    void (async () => {
      try {
        if (role === "host") {
          const session = await getLiveSessionById(sessionId);
          if (!request.headers.authorization && query.token) {
            request.headers.authorization = `Bearer ${query.token}`;
          }
          await requireBusinessAccess(request, session.business_id);
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
                console.warn("[live] AI reply failed", err);
              });
            } catch (err) {
              console.warn("[live] chat frame failed", err);
            }
          })();
        });
      } catch {
        socket.close(4404, "LIVE not found");
      }
    })();
  });
}
