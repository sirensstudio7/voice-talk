import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface MenuProduct {
  id: string;
  name: string;
  price: number;
  original_price?: number | null;
  discount_percent?: number;
  category: string;
  description: string;
  image_url?: string;
}

export interface MenuResponse {
  business: string;
  slug?: string;
  assistant_name?: string;
  background_url?: string;
  gradient_color?: string;
  products: MenuProduct[];
}

export async function fetchMenu(businessSlug: string): Promise<MenuResponse> {
  const response = await fetchWithTimeout(
    `${API_URL}/menu?business=${encodeURIComponent(businessSlug)}`,
    { cache: "no-store" },
  );
  if (!response.ok) {
    throw new Error("Unable to load menu.");
  }
  return response.json() as Promise<MenuResponse>;
}

export function menuFetchErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "Can't reach the server — it may be stopped or still starting. Run npm run api:ensure in the project root, then retry.";
  }
  if (error instanceof TypeError) {
    return "Can't connect to the server. Make sure the API is running on port 8000.";
  }
  return error instanceof Error ? error.message : "Unable to load menu.";
}
