export type ConnectionStatus = "idle" | "connecting" | "connected" | "error" | "disconnected";

export interface TranscriptMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}

export interface OrderItem {
  product_id: string;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
}

export interface OrderState {
  status: "open" | "confirmed";
  items: OrderItem[];
  total: number;
}

export const emptyOrder = (): OrderState => ({
  status: "open",
  items: [],
  total: 0,
});
