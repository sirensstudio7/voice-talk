/**
 * A `ws`-shaped facade over Elysia's WebSocket handler model.
 *
 * The session logic was written against the `ws` package: a long-lived
 * per-connection closure that calls `socket.on("message", ...)`. Elysia (and
 * Bun underneath it) instead dispatches to `{ open, message, close }` callbacks
 * with no per-connection closure. Rather than restructure the streaming code —
 * the part of the product least worth destabilising — the bridge re-exposes the
 * handful of `ws` members those handlers actually use: `on("message")`,
 * `on("close")`, `send`, `close`, `readyState` and `OPEN`.
 */

export const WS_OPEN = 1;

type MessageListener = (data: Buffer | string, isBinary: boolean) => void;
type CloseListener = () => void;

type RawSocket = {
  send: (data: string | Uint8Array) => unknown;
  close: (code?: number, reason?: string) => unknown;
  readyState: number;
};

/**
 * Elysia JSON-parses text frames before handing them over. The handlers expect
 * the wire format, so anything already parsed is re-serialised; binary frames
 * pass through as a Buffer.
 *
 * `isBinary` mirrors the second argument `ws` gives message listeners — the
 * audio path branches on it to tell PCM frames from JSON control messages.
 */
function normalize(message: unknown): { data: Buffer | string; isBinary: boolean } {
  if (message instanceof ArrayBuffer) {
    return { data: Buffer.from(message), isBinary: true };
  }
  if (ArrayBuffer.isView(message)) {
    return {
      data: Buffer.from(message.buffer, message.byteOffset, message.byteLength),
      isBinary: true,
    };
  }
  if (typeof message === "string") return { data: message, isBinary: false };
  return { data: JSON.stringify(message), isBinary: false };
}

export class SocketBridge {
  readonly OPEN = WS_OPEN;

  private messageListeners: MessageListener[] = [];
  private closeListeners: CloseListener[] = [];
  private closed = false;

  constructor(private readonly raw: RawSocket) {}

  get readyState(): number {
    return this.raw.readyState;
  }

  on(event: "message", listener: MessageListener): this;
  on(event: "close", listener: CloseListener): this;
  on(event: "message" | "close", listener: MessageListener | CloseListener): this {
    if (event === "message") this.messageListeners.push(listener as MessageListener);
    else this.closeListeners.push(listener as CloseListener);
    return this;
  }

  send(data: string | Uint8Array): void {
    if (this.closed || this.raw.readyState !== WS_OPEN) return;
    this.raw.send(data);
  }

  close(code?: number, reason?: string): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.raw.close(code, reason);
    } catch {
      // already gone
    }
  }

  /** Called by the route adapter, not by handler code. */
  dispatchMessage(message: unknown): void {
    const { data, isBinary } = normalize(message);
    for (const listener of this.messageListeners) listener(data, isBinary);
  }

  /** Called by the route adapter, not by handler code. */
  dispatchClose(): void {
    if (this.closed) return;
    this.closed = true;
    for (const listener of this.closeListeners) listener();
  }
}

type Record_ = Record<string, string | undefined>;

/** The request details Elysia exposes on a WebSocket connection. */
export type SocketData = {
  query: Record_;
  params: Record_;
  headers: Record_;
};

/**
 * Builds the Elysia `.ws()` config for a handler written against `ws`, wiring
 * one bridge per connection.
 */
export function socketRoute(
  handler: (socket: SocketBridge, data: SocketData) => void | Promise<void>,
) {
  const bridges = new Map<string | number, SocketBridge>();

  return {
    open(ws: { id: string | number; data: Partial<SocketData> } & RawSocket) {
      const bridge = new SocketBridge(ws);
      bridges.set(ws.id, bridge);
      void handler(bridge, {
        query: ws.data.query ?? {},
        params: ws.data.params ?? {},
        headers: { ...(ws.data.headers ?? {}) },
      });
    },
    message(ws: { id: string | number }, message: unknown) {
      bridges.get(ws.id)?.dispatchMessage(message);
    },
    close(ws: { id: string | number }) {
      const bridge = bridges.get(ws.id);
      bridges.delete(ws.id);
      bridge?.dispatchClose();
    },
  };
}
