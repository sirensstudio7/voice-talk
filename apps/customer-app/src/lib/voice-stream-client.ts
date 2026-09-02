import { OrderState } from "@/types/voice";

export type ConnectionStatus = "idle" | "connecting" | "connected" | "disconnected" | "error";

export type VoiceStreamEvents = {
  onStatusChange: (status: ConnectionStatus) => void;
  onTranscriptChunk: (role: "user" | "assistant", text: string) => void;
  onAssistantTurnBoundary: () => void;
  onAudioChunk: (pcmData: ArrayBuffer) => void;
  onTalkingChange: (isTalking: boolean) => void;
  onOrderUpdate: (order: OrderState) => void;
  onToolCall: (name: string, args: Record<string, unknown>) => void;
  onError: (error: string) => void;
  onConversationEnd: () => void;
  onSilenceTimeout: () => void;
};

export class VoiceStreamClient {
  private ws: WebSocket | null = null;
  private listeners: { [K in keyof VoiceStreamEvents]?: Set<VoiceStreamEvents[K]> } = {};
  private status: ConnectionStatus = "idle";

  private buildWsUrl(businessSlug: string, language: string): string {
    let base = process.env.NEXT_PUBLIC_WS_URL;
    if (!base && process.env.NEXT_PUBLIC_API_URL) {
      const api = new URL(process.env.NEXT_PUBLIC_API_URL);
      api.protocol = api.protocol === "https:" ? "wss:" : "ws:";
      api.pathname = "/ws/session";
      api.search = "";
      base = api.toString();
    }
    if (!base) {
      base = "ws://localhost:8000/ws/session";
    }
    const url = new URL(base);
    url.searchParams.set("business", businessSlug);
    url.searchParams.set("language", language);
    return url.toString();
  }

  private pingInterval: ReturnType<typeof setInterval> | null = null;

  public connect(businessSlug: string, language: string): void {
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      return;
    }
    this.disconnect();
    this.setStatus("connecting");

    const url = this.buildWsUrl(businessSlug, language);
    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    this.ws = ws;

    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "ping" }));
      }
    }, 25000);

    ws.onopen = () => {
      // Note: "session.status" with "connected" usually sets the final state
      // But we can set connected if we don't rely fully on the server event
    };

    ws.onmessage = (event) => {
      if (this.ws !== ws) return;

      if (event.data instanceof ArrayBuffer) {
        this.emit("onAudioChunk", event.data);
        return;
      }
      if (typeof Blob !== "undefined" && event.data instanceof Blob) {
        void event.data.arrayBuffer().then((buffer) => {
          this.emit("onAudioChunk", buffer);
        });
        return;
      }

      try {
        const payload = JSON.parse(event.data as string) as {
          type: string;
          text?: string;
          status?: string;
          order?: OrderState;
          error?: string;
          reason?: string;
          consent?: string;
          name?: string;
          args?: Record<string, unknown>;
        };

        switch (payload.type) {
          case "pong":
            // ignore heartbeat response
            break;
          case "session.status":
            if (payload.status === "connected" || payload.status === "reconnecting") {
              this.setStatus("connected");
            } else if (payload.status === "disconnected") {
              this.setStatus("disconnected");
            }
            break;
          case "transcript.user":
            if (payload.text) {
              this.emit("onTranscriptChunk", "user", payload.text);
            }
            break;
          case "transcript.assistant":
            if (payload.text) {
              this.emit("onTranscriptChunk", "assistant", payload.text);
            }
            break;
          case "turn_complete":
            this.emit("onAssistantTurnBoundary");
            break;
          case "order.updated":
            if (payload.order) {
              this.emit("onOrderUpdate", payload.order);
            }
            break;
          case "tool_call":
            if (payload.name) {
              this.emit("onToolCall", payload.name, payload.args ?? {});
            }
            break;
          case "checkout.prompt_payment":
            this.emit("onToolCall", "checkout.prompt_payment", {});
            break;
          case "conversation.complete":
            this.emit("onConversationEnd");
            break;
          case "error":
            this.setStatus("error");
            this.emit("onError", payload.error ?? "Unknown error");
            this.disconnect();
            break;
          case "audio.interrupted":
          case "interrupted":
            // Can be treated as an assistant turn boundary or specific tool call
            this.emit("onAssistantTurnBoundary");
            break;
          default:
            break;
        }
      } catch (err) {
        console.error("Failed to parse websocket message", err);
      }
    };

    ws.onerror = () => {
      if (this.ws !== ws) return;
      this.setStatus("error");
      this.emit("onError", "Unable to connect to voice server.");
    };

    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.setStatus("disconnected");
      if (this.pingInterval) {
        clearInterval(this.pingInterval);
        this.pingInterval = null;
      }
    };
  }

  public disconnect(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: "session.end" }));
        } catch {
          // ignore
        }
      }
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    if (this.status !== "disconnected") {
      this.setStatus("disconnected");
    }
  }

  public sendAudio(pcmData: ArrayBuffer): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(pcmData);
    }
  }

  public sendControl(type: string, payload?: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, ...payload }));
    }
  }

  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  public on<K extends keyof VoiceStreamEvents>(event: K, handler: VoiceStreamEvents[K]): void {
    if (!this.listeners[event]) {
      this.listeners[event] = new Set() as any;
    }
    this.listeners[event]!.add(handler);
  }

  public off<K extends keyof VoiceStreamEvents>(event: K, handler: VoiceStreamEvents[K]): void {
    if (this.listeners[event]) {
      this.listeners[event]!.delete(handler);
    }
  }

  private emit<K extends keyof VoiceStreamEvents>(event: K, ...args: Parameters<VoiceStreamEvents[K]>): void {
    const handlers = this.listeners[event];
    if (handlers) {
      handlers.forEach((handler) => (handler as any)(...args));
    }
  }

  private setStatus(newStatus: ConnectionStatus): void {
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.emit("onStatusChange", newStatus);
    }
  }
}
