"use client";

import {
  CheckCircleIcon,
  ClockIcon,
  CursorArrowRaysIcon,
  MegaphoneIcon,
  PhotoIcon,
  PlusIcon,
  QueueListIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { useEffect, useState } from "react";

import { AddonConfigPending } from "@/components/addon-config-pending";
import { CampaignBannerLayoutPreview } from "@/components/campaign-banner-layout-preview";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { Switch } from "@/components/ui/switch";
import {
  api,
  type CampaignBannerAnalytics,
  type CampaignBannerItem,
  type CampaignBannerLayout,
  type CampaignBannerSettings,
} from "@/lib/api";
import { adminPath } from "@/lib/admin-path";
import { ASSISTANT_TEMPLATES } from "@/lib/assistant-templates";
import { cn } from "@/lib/cn";
import { useAddonStatus } from "@/lib/use-addon-status";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function resolveMediaUrl(path: string): string {
  if (!path) return "";
  if (path.startsWith("blob:") || path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  return path.startsWith("/") ? `${API_URL}${path}` : `${API_URL}/${path}`;
}

type ManageTab = "display" | "banners" | "analytics";

const MANAGE_TABS: Array<{ id: ManageTab; label: string }> = [
  { id: "display", label: "Display" },
  { id: "banners", label: "Banners" },
  { id: "analytics", label: "Analytics" },
];

const LAYOUTS: Array<{ id: CampaignBannerLayout; label: string; hint: string }> = [
  { id: "top", label: "Top", hint: "Full-width strip under the header · 16:5" },
  { id: "right", label: "Right", hint: "Side rail on landscape only · 9:16" },
  { id: "bottom", label: "Bottom", hint: "Carousel above the mic bar · 16:5" },
];

const BANNER_ART = {
  top: {
    ratio: "16:5",
    pixels: "1600×500",
    boxClass: "aspect-[16/5]",
    tip: "Wide landscape. Keep text and logos in the center so they are not cropped on portrait kiosks.",
  },
  bottom: {
    ratio: "16:5",
    pixels: "1600×500",
    boxClass: "aspect-[16/5]",
    tip: "Wide landscape. Keep text and logos in the center so they are not cropped on portrait kiosks.",
  },
  right: {
    ratio: "9:16",
    pixels: "720×1280",
    boxClass: "aspect-[9/16] mx-auto w-full max-w-[220px]",
    tip: "Tall portrait. Shown on landscape kiosks only.",
  },
} as const;

const DEFAULT_PREVIEW_MODEL =
  ASSISTANT_TEMPLATES[0]?.modelPath ?? "/models/thanh.glb";
const DEFAULT_PREVIEW_NAME =
  ASSISTANT_TEMPLATES[0]?.assistant_name ?? "Assistant";

const FEATURES = [
  {
    icon: PhotoIcon,
    title: "Scheduled image banners",
    body: "Upload up to 5 promo images with start/end dates and per-slide duration.",
  },
  {
    icon: QueueListIcon,
    title: "Auto-slide on kiosk",
    body: "Banners rotate while idle, pause during conversation, and hide on payment.",
  },
  {
    icon: CursorArrowRaysIcon,
    title: "Clicks & impressions",
    body: "Track how often each banner is shown and tapped, with CTR in the dashboard.",
  },
] as const;

const SCREENSHOTS = [
  {
    id: "s1",
    src: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "s2",
    src: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "s3",
    src: "https://images.unsplash.com/photo-1560472355-536de3962603?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "s4",
    src: "https://images.unsplash.com/photo-1556740758-90de374c12ad?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "s5",
    src: "https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&w=800&q=80",
  },
] as const;

function toLocalInputValue(iso: string | null | undefined) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocalInputValue(value: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function CampaignBannerPageClient() {
  const { token, business, status, loading, error, setError, isActive, isPending } =
    useAddonStatus("campaign_banner");
  const { state: sidebarState, isMobile } = useSidebar();
  const [settings, setSettings] = useState<CampaignBannerSettings | null>(null);
  const [banners, setBanners] = useState<CampaignBannerItem[]>([]);
  const [analytics, setAnalytics] = useState<CampaignBannerAnalytics | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [manageTab, setManageTab] = useState<ManageTab>("display");
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [previewRevision, setPreviewRevision] = useState(0);
  const [previewModelPath, setPreviewModelPath] = useState(DEFAULT_PREVIEW_MODEL);
  const [previewAssistantName, setPreviewAssistantName] = useState(DEFAULT_PREVIEW_NAME);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [localPreviews, setLocalPreviews] = useState<Record<string, string>>({});
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});

  const slug = business?.slug ?? "";
  const bannerArt = BANNER_ART[settings?.layout ?? "top"];

  useEffect(() => {
    if (!token || !business?.id) return;
    void api
      .getAiRules(token, business.id)
      .then((rules) => {
        if (rules?.avatar_model_path) setPreviewModelPath(rules.avatar_model_path);
        if (rules?.assistant_name) setPreviewAssistantName(rules.assistant_name);
      })
      .catch(() => undefined);
  }, [token, business?.id]);

  useEffect(() => {
    if (!token || !business?.id || !isActive) return;
    let cancelled = false;
    void (async () => {
      try {
        const [nextSettings, bannerRes, stats] = await Promise.all([
          api.getCampaignBannerSettings(token, business.id),
          api.listCampaignBanners(token, business.id),
          api.getCampaignBannerAnalytics(token, business.id),
        ]);
        if (cancelled) return;
        setSettings(nextSettings);
        setBanners(bannerRes.items);
        setAnalytics(stats);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load Campaign Banner");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, business?.id, isActive, setError]);

  useEffect(() => {
    return () => {
      for (const url of Object.values(localPreviews)) {
        URL.revokeObjectURL(url);
      }
    };
    // Only revoke leftover blob URLs on unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveSettings(patch: { enabled?: boolean; layout?: CampaignBannerLayout }) {
    if (!token || !business?.id || !settings) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await api.updateCampaignBannerSettings(token, business.id, patch);
      setSettings(updated);
      setPreviewRevision((n) => n + 1);
      setMessage("Display settings saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setBusy(false);
    }
  }

  async function createBanner() {
    if (!token || !business?.id || !newTitle.trim()) return;
    if (banners.length >= 5) {
      setError("Maximum 5 banners per workspace");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const created = await api.createCampaignBanner(token, business.id, {
        title: newTitle.trim(),
        duration_sec: 5,
        is_active: true,
      });
      setBanners((prev) => [...prev, created]);
      setNewTitle("");
      setManageTab("banners");
      setMessage("Banner created — upload an image to show it on the kiosk.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create banner");
    } finally {
      setCreating(false);
    }
  }

  async function patchBanner(bannerId: string, body: Parameters<typeof api.updateCampaignBanner>[3]) {
    if (!token || !business?.id) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.updateCampaignBanner(token, business.id, bannerId, body);
      setBanners((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update banner");
    } finally {
      setBusy(false);
    }
  }

  async function onUploadImage(bannerId: string, file: File | null) {
    if (!token || !business?.id || !file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      const message = "Image must be PNG, JPG, or WebP.";
      setUploadErrors((prev) => ({ ...prev, [bannerId]: message }));
      setError(message);
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      const message = "Banner image must be 3 MB or smaller.";
      setUploadErrors((prev) => ({ ...prev, [bannerId]: message }));
      setError(message);
      return;
    }
    const preview = URL.createObjectURL(file);
    setLocalPreviews((prev) => {
      const current = prev[bannerId];
      if (current) URL.revokeObjectURL(current);
      return { ...prev, [bannerId]: preview };
    });
    setUploadErrors((prev) => ({ ...prev, [bannerId]: "" }));
    setUploadingId(bannerId);
    setBusy(true);
    setError(null);
    try {
      const updated = await api.uploadCampaignBannerImage(token, business.id, bannerId, file);
      setBanners((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
      setLocalPreviews((prev) => {
        const current = prev[bannerId];
        if (current) URL.revokeObjectURL(current);
        const next = { ...prev };
        delete next[bannerId];
        return next;
      });
      setPreviewRevision((n) => n + 1);
      setMessage("Banner image uploaded");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      setUploadErrors((prev) => ({ ...prev, [bannerId]: message }));
      setError(message);
    } finally {
      setUploadingId(null);
      setBusy(false);
    }
  }

  async function removeBanner(bannerId: string) {
    if (!token || !business?.id) return;
    if (!confirm("Delete this banner?")) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteCampaignBanner(token, business.id, bannerId);
      setBanners((prev) => prev.filter((b) => b.id !== bannerId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete banner");
    } finally {
      setBusy(false);
    }
  }

  async function moveBanner(bannerId: string, direction: -1 | 1) {
    if (!token || !business?.id) return;
    const index = banners.findIndex((b) => b.id === bannerId);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= banners.length) return;
    const ordered = [...banners];
    const [item] = ordered.splice(index, 1);
    ordered.splice(next, 0, item!);
    setBusy(true);
    try {
      const res = await api.reorderCampaignBanners(
        token,
        business.id,
        ordered.map((b) => b.id),
      );
      setBanners(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reorder");
    } finally {
      setBusy(false);
    }
  }

  const priceLabel = (status?.addon.price_display ?? "Rp199.000/month").replace(
    /\/\s*month/i,
    "",
  );
  const productName = status?.addon.name ?? "Campaign Banner";
  const productDescription =
    status?.addon.description ??
    "Scheduled promo banners on the AI kiosk with auto-slide and analytics.";

  const footerStyle = {
    left: isMobile
      ? "0px"
      : sidebarState === "collapsed"
        ? "var(--sidebar-width-icon)"
        : "var(--sidebar-width)",
  } as const;

  return (
    <>
      <div className="mx-auto w-full max-w-3xl space-y-10 pb-24">
        {error ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-700">
            {message}
          </p>
        ) : null}

        {loading ? (
          <div className="flex gap-4">
            <div className="size-[88px] shrink-0 animate-pulse rounded-[22px] bg-slate-100" />
            <div className="flex-1 space-y-3 py-1">
              <div className="h-7 w-48 animate-pulse rounded bg-slate-100" />
              <div className="h-4 w-64 animate-pulse rounded bg-slate-100" />
            </div>
          </div>
        ) : (
          <header className="flex items-start gap-4 sm:gap-5">
            <div className="flex size-[88px] shrink-0 items-center justify-center rounded-[22px] bg-gradient-to-br from-rose-500 to-orange-500 shadow-sm sm:size-[104px] sm:rounded-[26px]">
              <MegaphoneIcon className="size-10 text-white sm:size-12" aria-hidden />
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <h1 className="text-[22px] font-semibold tracking-tight text-slate-900 sm:text-[28px]">
                {productName}
              </h1>
              <p className="mt-0.5 text-sm text-orange-600 sm:text-[15px]">LORESCALE Add-on</p>
              <p className="mt-2 text-sm text-slate-500">
                {isActive ? (
                  <span className="inline-flex items-center gap-1 font-medium text-emerald-600">
                    <CheckCircleIcon className="size-4" aria-hidden />
                    Installed
                  </span>
                ) : isPending ? (
                  <span className="inline-flex items-center gap-1 font-medium text-amber-600">
                    <ClockIcon className="size-4" aria-hidden />
                    Pending approval
                  </span>
                ) : (
                  <>
                    <span className="font-semibold text-slate-900">{priceLabel}</span>
                    <span className="text-slate-400"> / month · per workspace</span>
                  </>
                )}
              </p>
            </div>
          </header>
        )}

        {!loading && !isActive ? (
          <>
            <section className="-mx-4 sm:mx-0">
              <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [-ms-overflow-style:none] sm:px-0 [&::-webkit-scrollbar]:hidden">
                {SCREENSHOTS.map((shot) => (
                  <div
                    key={shot.id}
                    className="w-[72%] shrink-0 snap-center overflow-hidden rounded-[20px] bg-slate-100 sm:w-[240px]"
                  >
                    <div className="aspect-[9/16]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={shot.src}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight text-slate-900">About</h2>
              <p className="text-[15px] leading-relaxed text-slate-600">{productDescription}</p>
              <p className="text-[15px] leading-relaxed text-slate-600">
                Ideal for hospitals, transit, malls, cafés, and public-service kiosks that need
                rotating promos without redeploying the app.
              </p>
            </section>

            <section>
              <h2 className="mb-1 text-xl font-semibold tracking-tight text-slate-900">Features</h2>
              <ul className="divide-y divide-slate-100">
                {FEATURES.map(({ icon: Icon, title, body }) => (
                  <li key={title} className="flex gap-4 py-4">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-50 text-slate-700">
                      <Icon className="size-5" aria-hidden />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-[15px] font-semibold text-slate-900">{title}</h3>
                      <p className="mt-0.5 text-sm leading-relaxed text-slate-500">{body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : null}

        {isActive && settings ? (
          <section className="space-y-4">
            <h2 className="text-xl font-semibold tracking-tight text-slate-900">Configuration</h2>
            <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
              {MANAGE_TABS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setManageTab(item.id)}
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm font-medium transition",
                    manageTab === item.id
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-600 hover:text-slate-900",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {manageTab === "display" ? (
              <div className="space-y-5">
                <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <label htmlFor="campaign-banner-enabled" className="text-sm font-medium text-slate-800">
                    Enabled on kiosk
                  </label>
                  <Switch
                    id="campaign-banner-enabled"
                    checked={settings.enabled}
                    disabled={busy}
                    onCheckedChange={(checked) => {
                      setSettings({ ...settings, enabled: checked });
                      void saveSettings({ enabled: checked });
                    }}
                  />
                </div>
                <div className="space-y-3">
                  <p className="text-sm font-medium text-slate-800">Layout</p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {LAYOUTS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setSettings({ ...settings, layout: item.id });
                          void saveSettings({ layout: item.id });
                        }}
                        className={cn(
                          "rounded-xl border px-3 py-3 text-left transition",
                          settings.layout === item.id
                            ? "border-orange-300 bg-orange-50 ring-1 ring-orange-200"
                            : "border-slate-200 bg-white hover:border-slate-300",
                        )}
                      >
                        <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{item.hint}</p>
                      </button>
                    ))}
                  </div>

                  <CampaignBannerLayoutPreview
                    slug={slug}
                    layout={settings.layout}
                    revision={previewRevision}
                    modelPath={previewModelPath}
                    assistantName={previewAssistantName}
                  />
                </div>
              </div>
            ) : null}

            {manageTab === "banners" ? (
              <div className="space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="New banner title"
                    className="h-10 flex-1 rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-500/20"
                  />
                  <Button
                    type="button"
                    disabled={creating || !newTitle.trim() || banners.length >= 5}
                    onClick={() => void createBanner()}
                  >
                    <PlusIcon className="size-4" />
                    Add banner
                  </Button>
                </div>
                <p className="text-xs text-slate-500">
                  {banners.length}/5 banners · recommended {bannerArt.ratio} ({bannerArt.pixels})
                  for {settings.layout} layout
                </p>

                {banners.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                    No banners yet. Add a title, then click the card to upload a JPG, PNG, or WebP
                    ad.
                  </p>
                ) : (
                  <ul className="space-y-4">
                    {banners.map((banner, index) => {
                      const imageSrc =
                        localPreviews[banner.id] || resolveMediaUrl(banner.image_url);
                      const isUploading = uploadingId === banner.id;
                      const cardError = uploadErrors[banner.id];
                      return (
                      <li
                        key={banner.id}
                        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                      >
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <input
                              type="text"
                              defaultValue={banner.title}
                              onBlur={(e) => {
                                const title = e.target.value.trim();
                                if (title && title !== banner.title) {
                                  void patchBanner(banner.id, { title });
                                }
                              }}
                              className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 text-sm font-medium outline-none focus:border-orange-300"
                            />
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={banner.is_active}
                                disabled={busy}
                                onCheckedChange={(checked) =>
                                  void patchBanner(banner.id, { is_active: checked })
                                }
                              />
                              <button
                                type="button"
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                                onClick={() => void removeBanner(banner.id)}
                                aria-label="Delete banner"
                              >
                                <TrashIcon className="size-4" />
                              </button>
                            </div>
                          </div>

                          <label
                            className={cn(
                              "relative flex w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed transition",
                              bannerArt.boxClass,
                              imageSrc
                                ? "border-slate-200 bg-slate-100 hover:border-orange-300"
                                : "border-slate-300 bg-slate-50 hover:border-orange-400 hover:bg-orange-50/40",
                              isUploading && "pointer-events-none",
                            )}
                          >
                            {imageSrc ? (
                              <>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={imageSrc}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                                <span className="absolute inset-x-0 bottom-0 bg-slate-900/55 px-3 py-1.5 text-center text-[11px] font-medium text-white">
                                  {isUploading ? "Uploading…" : "Click to replace image"}
                                </span>
                              </>
                            ) : (
                              <span className="flex flex-col items-center gap-1 px-4 text-center">
                                <PhotoIcon className="size-7 text-slate-400" aria-hidden />
                                <span className="text-sm font-medium text-slate-700">
                                  {isUploading ? "Uploading…" : "Click to upload banner"}
                                </span>
                                <span className="text-xs font-medium text-slate-600">
                                  Recommended {bannerArt.ratio}
                                  <span className="font-normal text-slate-400">
                                    {" "}
                                    · {bannerArt.pixels} px
                                  </span>
                                </span>
                                <span className="text-[11px] leading-snug text-slate-400">
                                  JPG, PNG, or WebP · max 3 MB
                                </span>
                              </span>
                            )}
                            {isUploading ? (
                              <span className="absolute inset-0 flex items-center justify-center bg-white/50">
                                <span className="h-8 w-8 animate-spin rounded-full border-2 border-orange-200 border-t-orange-500" />
                              </span>
                            ) : null}
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
                              className="hidden"
                              disabled={isUploading}
                              onChange={(e) => {
                                void onUploadImage(banner.id, e.target.files?.[0] ?? null);
                                e.target.value = "";
                              }}
                            />
                          </label>
                          <p className="text-[11px] leading-relaxed text-slate-400">
                            {bannerArt.tip}
                          </p>
                          {cardError ? (
                            <p className="text-xs text-red-600">{cardError}</p>
                          ) : null}

                          <div className="grid gap-2 sm:grid-cols-2">
                            <label className="block space-y-1 text-xs text-slate-500">
                              Duration (sec)
                              <input
                                type="number"
                                min={3}
                                max={30}
                                defaultValue={banner.duration_sec}
                                onBlur={(e) => {
                                  const value = Number(e.target.value);
                                  if (value !== banner.duration_sec) {
                                    void patchBanner(banner.id, { duration_sec: value });
                                  }
                                }}
                                className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-sm text-slate-900 outline-none"
                              />
                            </label>
                            <label className="block space-y-1 text-xs text-slate-500">
                              Start
                              <input
                                type="datetime-local"
                                defaultValue={toLocalInputValue(banner.start_at)}
                                onBlur={(e) => {
                                  const iso = fromLocalInputValue(e.target.value);
                                  if (iso) void patchBanner(banner.id, { start_at: iso });
                                }}
                                className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-sm outline-none"
                              />
                            </label>
                              <label className="block space-y-1 text-xs text-slate-500">
                                End (optional)
                                <input
                                  type="datetime-local"
                                  defaultValue={toLocalInputValue(banner.end_at)}
                                  onBlur={(e) => {
                                    void patchBanner(banner.id, {
                                      end_at: fromLocalInputValue(e.target.value),
                                    });
                                  }}
                                  className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-sm outline-none"
                                />
                              </label>
                              <label className="block space-y-1 text-xs text-slate-500 sm:col-span-2">
                                Target URL
                                <input
                                  type="url"
                                  defaultValue={banner.target_url ?? ""}
                                  onBlur={(e) => {
                                    const value = e.target.value.trim() || null;
                                    if (value !== banner.target_url) {
                                      void patchBanner(banner.id, { target_url: value });
                                    }
                                  }}
                                  placeholder="https://"
                                  className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-sm outline-none"
                                />
                              </label>
                              <label className="block space-y-1 text-xs text-slate-500 sm:col-span-2">
                                QR URL
                                <input
                                  type="url"
                                  defaultValue={banner.qr_url ?? ""}
                                  onBlur={(e) => {
                                    const value = e.target.value.trim() || null;
                                    if (value !== banner.qr_url) {
                                      void patchBanner(banner.id, { qr_url: value });
                                    }
                                  }}
                                  placeholder="https://"
                                  className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-sm outline-none"
                                />
                              </label>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={busy || index === 0}
                                onClick={() => void moveBanner(banner.id, -1)}
                              >
                                Move up
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={busy || index === banners.length - 1}
                                onClick={() => void moveBanner(banner.id, 1)}
                              >
                                Move down
                              </Button>
                            </div>
                        </div>
                      </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ) : null}

            {manageTab === "analytics" && analytics ? (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-slate-400">Impressions</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
                      {analytics.total_impressions}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-slate-400">Clicks</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
                      {analytics.total_clicks}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-slate-400">CTR</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
                      {analytics.ctr}%
                    </p>
                  </div>
                </div>
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                      <tr>
                        <th className="px-3 py-2 font-medium">Banner</th>
                        <th className="px-3 py-2 font-medium">Impr.</th>
                        <th className="px-3 py-2 font-medium">Clicks</th>
                        <th className="px-3 py-2 font-medium">CTR</th>
                        <th className="px-3 py-2 font-medium">Last shown</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {analytics.by_banner.map((row) => (
                        <tr key={row.banner_id}>
                          <td className="px-3 py-2 font-medium text-slate-900">{row.title}</td>
                          <td className="px-3 py-2 tabular-nums text-slate-600">{row.impressions}</td>
                          <td className="px-3 py-2 tabular-nums text-slate-600">{row.clicks}</td>
                          <td className="px-3 py-2 tabular-nums text-slate-600">{row.ctr}%</td>
                          <td className="px-3 py-2 text-slate-500">
                            {row.last_shown_at
                              ? new Date(row.last_shown_at).toLocaleString()
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </section>
        ) : isActive ? (
          <AddonConfigPending />
        ) : null}
      </div>

      <footer
        style={footerStyle}
        className="fixed bottom-0 right-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/80"
      >
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{productName}</p>
            <p className="truncate text-xs text-slate-500">
              {isActive
                ? "Installed on this workspace"
                : isPending
                  ? "Waiting for payment approval"
                  : `${priceLabel}/mo · per workspace`}
            </p>
          </div>
          {isActive || isPending ? (
            <Button variant="outline" disabled>
              {isActive ? "Active" : "Requested"}
            </Button>
          ) : loading ? (
            <Button variant="outline" disabled>
              Subscribe
            </Button>
          ) : (
            <Button asChild>
              <Link href={adminPath(slug, "/add-ons/campaign-banner/payment")}>Subscribe</Link>
            </Button>
          )}
        </div>
      </footer>
    </>
  );
}
