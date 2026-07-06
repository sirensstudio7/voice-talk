import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import type { OrderState } from "@/types/voice";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function parseApiError(data: unknown): string {
  if (data && typeof data === "object" && "detail" in data) {
    const detail = (data as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0];
      if (typeof first === "object" && first && "msg" in first) {
        return String((first as { msg: unknown }).msg);
      }
    }
  }
  return "Could not confirm order.";
}

export async function persistConfirmedOrder(
  businessSlug: string,
  order: OrderState,
): Promise<void> {
  const response = await fetchWithTimeout(
    `${API_URL}/businesses/${encodeURIComponent(businessSlug)}/orders/confirm`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: order.items.map((item) => ({
          product_id: item.product_id,
          quantity: item.quantity,
        })),
      }),
    },
  );

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(parseApiError(data));
  }
}
