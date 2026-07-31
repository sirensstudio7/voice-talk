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
  avatar_model_path?: string;
  background_url?: string;
  gradient_color?: string;
  display_orientation?: string;
  voice_preset?: string;
  capabilities?: BusinessCapabilities;
  vision?: VisionConfig;
  smart_photo_moment?: {
    active: boolean;
    enabled: boolean;
    voice_prompt: string;
    countdown_seconds: number;
  };
  products: MenuProduct[];
}

export async function fetchMenu(businessSlug: string): Promise<MenuResponse> {
  const url = `${API_URL}/menu?business=${encodeURIComponent(businessSlug)}`;
  let lastError: unknown;
  const timeouts = [20_000, 28_000, 35_000];

  for (let attempt = 0; attempt < timeouts.length; attempt++) {
    try {
      const response = await fetchWithTimeout(
        url,
        { cache: "no-store" },
        timeouts[attempt],
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
      if (retryable && attempt < timeouts.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
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
