const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function trackCampaignBannerEvent(params: {
  slug: string;
  bannerId: string;
  eventName: "campaign_banner_impression" | "campaign_banner_click";
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await fetch(`${API_URL}/public/campaign-banner/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: params.slug,
        bannerId: params.bannerId,
        eventName: params.eventName,
        metadata: params.metadata,
      }),
      keepalive: true,
    });
  } catch {
    // Best-effort analytics — never block the kiosk UI.
  }
}
