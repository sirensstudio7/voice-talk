import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import type { BusinessCapabilities } from "@voicetalk/shared";

import type { VisionConfig } from "@/types/kiosk";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export const DEFAULT_ASSISTANT_AVATAR = "/lorescale-cashier-nobg.png";

export function resolveMediaUrl(path: string): string {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${API_URL}${path}`;
}

export interface MenuProduct {
  id: string;
  name: string;
  price: number;
  original_price?: number | null;
  discount_percent?: number;
  category: string;
  description: string;
  image_url?: string;
  duration_min?: number;
}

export interface MenuResponse {
  business: string;
  slug?: string;
  business_type?: string;
  assistant_name?: string;
  avatar_url?: string;
  background_url?: string;
  gradient_color?: string;
  display_orientation?: string;
  capabilities?: BusinessCapabilities;
  vision?: VisionConfig;
  products: MenuProduct[];
}

export async function fetchMenu(businessSlug: string): Promise<MenuResponse> {
  const url = `${API_URL}/menu?business=${encodeURIComponent(businessSlug)}`;
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetchWithTimeout(
        url,
        { cache: "no-store" },
        attempt === 0 ? 18_000 : 24_000,
      );
      if (!response.ok) {
        throw new Error("Unable to load menu.");
      }
      return (await response.json()) as MenuResponse;
    } catch (error) {
      lastError = error;
      const retryable =
        (error instanceof DOMException && error.name === "AbortError") ||
        error instanceof TypeError;
      if (retryable && attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }
      throw error;
    }
  }

  throw lastError;
}

export function menuFetchErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "The server is slow to respond — it may still be starting. Run npm run api:ensure in the project root, wait a few seconds, then refresh.";
  }
  if (error instanceof TypeError) {
    return "Can't connect to the server. Run npm run api:ensure in the project root, then refresh.";
  }
  return error instanceof Error ? error.message : "Unable to load menu.";
}
