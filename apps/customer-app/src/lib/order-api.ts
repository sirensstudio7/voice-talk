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

/**
 * One idempotency key per checkout signature, kept for the tab's lifetime so a
 * retry after a lost response (or a reload) reuses it and the server returns
 * the order it already created instead of a duplicate (TKT-018).
 *
 * The signature covers the items, so editing the basket after a failure makes
 * a new key — and a fresh, intentional order later is not deduplicated.
 */
function confirmationRequestKey(businessSlug: string, order: OrderState): string | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    const signature = JSON.stringify({
      business: businessSlug,
      items: order.items.map((item) => [item.product_id, item.quantity]),
    });
    const storageKey = `vt-order-confirm:${signature}`;
    const existing = sessionStorage.getItem(storageKey);
    if (existing) return existing;
    const created = crypto.randomUUID();
    sessionStorage.setItem(storageKey, created);
    return created;
  } catch {
    return null;
  }
}

function clearConfirmationRequestKey(businessSlug: string, order: OrderState): void {
  try {
    if (typeof sessionStorage === "undefined") return;
    const signature = JSON.stringify({
      business: businessSlug,
      items: order.items.map((item) => [item.product_id, item.quantity]),
    });
    sessionStorage.removeItem(`vt-order-confirm:${signature}`);
  } catch {
    // Best effort: a stale key only affects a retry of this exact basket.
  }
}

export async function persistConfirmedOrder(
  businessSlug: string,
  order: OrderState,
): Promise<void> {
  const requestKey = confirmationRequestKey(businessSlug, order);
  const response = await fetchWithTimeout(
    `${API_URL}/businesses/${encodeURIComponent(businessSlug)}/orders/confirm`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(requestKey ? { "Idempotency-Key": requestKey } : {}),
      },
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

  clearConfirmationRequestKey(businessSlug, order);
}
