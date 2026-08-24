import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type LiveProduct = {
  id: string;
  product_id?: string;
  name: string;
  price: number;
  image_url: string;
  description: string;
  live_only?: boolean;
};

export type LiveMessage = {
  id: string;
  role: string;
  display_name: string;
  body: string;
  product_id: string | null;
  created_at: string;
};

export type LiveSession = {
  id: string;
  business_id: string;
  business_slug: string;
  business_name: string;
  title: string;
  slug: string;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  products: LiveProduct[];
  viewer_count: number;
};

export async function persistLiveOrder(
  sessionId: string,
  order: {
    items: Array<{ product_id: string; quantity: number }>;
    customer_name?: string;
    customer_phone?: string;
    customer_address?: string;
    customer_notes?: string;
  },
): Promise<void> {
  const response = await fetchWithTimeout(
    `${API_URL}/live/sessions/${encodeURIComponent(sessionId)}/orders`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: order.items,
        customer_name: order.customer_name,
        customer_phone: order.customer_phone,
        customer_address: order.customer_address,
        customer_notes: order.customer_notes,
      }),
    },
  );
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(typeof data?.detail === "string" ? data.detail : "Could not confirm order.");
  }
}

export function buildLiveViewerWsUrl(sessionId: string, name: string) {
  const url = new URL(API_URL);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `/ws/live/${sessionId}`;
  url.searchParams.set("role", "viewer");
  url.searchParams.set("name", name);
  return url.toString();
}

function liveFetchError(err: unknown) {
  if (err instanceof DOMException && err.name === "AbortError") {
    return "LIVE server timed out. Refresh and try again.";
  }
  if (err instanceof TypeError) {
    return "Can't reach the LIVE server. Refresh in a moment.";
  }
  return err instanceof Error ? err.message : "This LIVE is not on air";
}

export async function fetchPublicLive(sessionId: string): Promise<{
  session: LiveSession;
  messages: LiveMessage[];
}> {
  try {
    const response = await fetchWithTimeout(
      `${API_URL}/live/sessions/${encodeURIComponent(sessionId)}`,
    );
    const data = (await response.json().catch(() => null)) as
      | { session?: LiveSession; messages?: LiveMessage[]; detail?: string }
      | null;
    if (!response.ok) {
      throw new Error(data && typeof data.detail === "string" ? data.detail : "This LIVE is not on air");
    }
    if (!data?.session) throw new Error("This LIVE is not on air");
    return { session: data.session, messages: data.messages ?? [] };
  } catch (err) {
    throw new Error(liveFetchError(err));
  }
}
