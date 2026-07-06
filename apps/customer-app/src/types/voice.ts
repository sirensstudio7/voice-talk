export type ConnectionStatus = "idle" | "connecting" | "connected" | "error" | "disconnected";

export type AiLanguage = "id" | "en";

export type CheckoutPhase = "shopping" | "awaiting_payment" | "paid";

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
  note?: string;
  image_url?: string;
}

export interface OrderState {
  status: "open" | "confirmed";
  items: OrderItem[];
  total: number;
  customer_name?: string;
}

export const emptyOrder = (): OrderState => ({
  status: "open",
  items: [],
  total: 0,
});
