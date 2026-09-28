import {
  normalizeVoiceGender,
  normalizeVoicePreset,
} from "@voicetalk/shared";

import { inc, observe } from "../http/metrics.js";
import { logger } from "../http/logger.js";
import { getLanguagePackPublicConfig, getSmartPhotoMomentPublicConfig } from "./addon-entitlement.js";
import { getCampaignBannerPublicConfig } from "./campaign-banner.js";
import { resolveCapabilities } from "./capabilities.js";
import { getActiveProducts, resolveAssistantName } from "./config-builder.js";
import { getBookingPublicConfig } from "./booking.js";
import { getLuckySpinPublicConfig } from "./lucky-spin.js";
import { getCachedMenu, setCachedMenu } from "./menu-cache.js";
import { effectivePrice } from "./pricing.js";
import { getBusinessBySlug } from "./tenant.js";
import { getOrCreateVisionSettings } from "./vision-orchestrator.js";
import { visionSettingsOut } from "./vision-settings.js";

const log = logger.child({ component: "menu" });

/** Uncached builds above this are worth a warning line (see TKT-005/015). */
const MENU_BUILD_SLOW_MS = 1_000;

type BuiltMenu = { businessId: string; payload: Record<string, unknown> };
export type MenuPayload = NonNullable<Awaited<ReturnType<typeof buildMenuPayload>>>["payload"];

async function buildMenuPayload(businessSlug: string): Promise<BuiltMenu | null> {
  const started = performance.now();
  const tenant = await getBusinessBySlug(businessSlug);
  if (!tenant) return null;

  // Independent reads: fan out instead of awaiting one by one.
  const [
    { capabilities },
    vision,
    smartPhotoMoment,
    luckySpin,
    campaignBanner,
    languagePack,
    booking,
  ] = await Promise.all([
    resolveCapabilities(tenant),
    getOrCreateVisionSettings(tenant.id),
    getSmartPhotoMomentPublicConfig(tenant.id),
    getLuckySpinPublicConfig(tenant.id),
    getCampaignBannerPublicConfig(tenant.id),
    getLanguagePackPublicConfig(tenant.id),
    getBookingPublicConfig(tenant.id),
  ]);
  const productList = capabilities.menu_enabled ? getActiveProducts(tenant) : [];

  const payload = {
    business: tenant.name,
    slug: tenant.slug,
    tagline: tenant.tagline,
    business_type: tenant.businessType,
    assistant_name: resolveAssistantName(tenant.aiRules),
    avatar_url: tenant.aiRules?.avatarUrl || "",
    avatar_model_path: tenant.aiRules?.avatarModelPath || "",
    background_url: tenant.backgroundUrl || "",
    gradient_color: tenant.gradientColor || "",
    display_orientation: tenant.displayOrientation || "landscape",
    kiosk_ui_mode: tenant.kioskUiMode === "studio" ? "studio" : "classic",
    voice_preset: normalizeVoicePreset(tenant.aiRules?.voicePreset),
    voice_gender: normalizeVoiceGender(tenant.aiRules?.voiceGender),
    capabilities,
    vision: visionSettingsOut(vision),
    smart_photo_moment: smartPhotoMoment,
    lucky_spin: luckySpin,
    campaign_banner: campaignBanner,
    languages: languagePack,
    booking,
    products: productList.map((p) => ({
      id: p.productId,
      name: p.name,
      price: effectivePrice(p.price, p.discountPercent),
      original_price: p.discountPercent > 0 ? p.price : null,
      discount_percent: p.discountPercent,
      category: p.category,
      description: p.description,
      image_url: p.imageUrl,
      duration_min: p.durationMin,
    })),
  };

  const durationMs = performance.now() - started;
  observe("menu.build_ms", durationMs);
  if (durationMs > MENU_BUILD_SLOW_MS) {
    log.warn({ businessSlug, durationMs: Math.round(durationMs) }, "menu.build_slow");
  }
  return { businessId: tenant.id, payload };
}

/**
 * Menu payload for the kiosk, served from the 45s in-process cache when warm.
 * Invalidation happens through `menu-cache` from every config mutation path and
 * every kiosk bus payload, so a settings change reaches kiosks in ~1s.
 */
export async function getMenuPayload(businessSlug: string): Promise<MenuPayload | null> {
  const cached = getCachedMenu<MenuPayload>(businessSlug);
  if (cached) {
    inc("menu.cache_hits_total");
    return cached;
  }

  inc("menu.cache_misses_total");
  const built = await buildMenuPayload(businessSlug);
  if (!built) return null;
  setCachedMenu(businessSlug, built.businessId, built.payload);
  return built.payload;
}
