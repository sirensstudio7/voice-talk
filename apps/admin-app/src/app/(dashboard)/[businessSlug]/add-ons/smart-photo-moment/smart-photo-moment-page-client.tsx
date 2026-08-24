"use client";

import {
  CameraIcon,
  CheckCircleIcon,
  ClockIcon,
  QrCodeIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { AddonConfigPending } from "@/components/addon-config-pending";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { Switch } from "@/components/ui/switch";
import {
  api,
  type PhotoAnalytics,
  type PhotoGalleryItem,
  type PhotoSettings,
} from "@/lib/api";
import { adminPath } from "@/lib/admin-path";
import { peekAddonStatus } from "@/lib/addon-status-cache";
import { cn } from "@/lib/cn";
import { useAddonStatus } from "@/lib/use-addon-status";

type ManageTab = "display" | "branding" | "gallery" | "analytics";

const MANAGE_TABS: Array<{ id: ManageTab; label: string }> = [
  { id: "display", label: "Display" },
  { id: "branding", label: "Branding" },
  { id: "gallery", label: "Gallery" },
  { id: "analytics", label: "Analytics" },
];

const FEATURES = [
  {
    icon: SparklesIcon,
    title: "Voice offer after payment",
    body: "AI invites guests to take a souvenir photo right after a successful transaction.",
  },
  {
    icon: CameraIcon,
    title: "Hands-free capture",
    body: "Camera opens automatically, detects a stable face, then counts down and snaps.",
  },
  {
    icon: QrCodeIcon,
    title: "QR download",
    body: "Guests scan a QR code to download a branded photo on their phone.",
  },
] as const;

const SCREENSHOTS = [
  {
    id: "s1",
    src: "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "s2",
    src: "https://images.unsplash.com/photo-1511632765486-a01980e01a18?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "s3",
    src: "https://images.unsplash.com/photo-1528605105345-5344ea20e269?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "s4",
    src: "https://images.unsplash.com/photo-1543269865-cbf427effbad?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "s5",
    src: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=800&q=80",
  },
] as const;

export function SmartPhotoMomentPageClient() {
  const { token, business, status, loading, error, setError, isActive, isPending } =
    useAddonStatus("smart_photo_moment");
  const { state: sidebarState, isMobile } = useSidebar();
  const [settings, setSettings] = useState<PhotoSettings | null>(() => {
    const cached = business?.id ? peekAddonStatus(business.id, "smart_photo_moment") : null;
    return cached?.subscription_status === "active" ? cached.settings : null;
  });
  const [analytics, setAnalytics] = useState<PhotoAnalytics | null>(null);
  const [gallery, setGallery] = useState<PhotoGalleryItem[]>([]);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [manageTab, setManageTab] = useState<ManageTab>("display");

  useEffect(() => {
    if (status?.subscription_status === "active" && status.settings) {
      setSettings((current) => current ?? status.settings);
    }
  }, [status]);

  const loadActiveData = useCallback(async () => {
    if (!token || !business?.id) return;
    try {
      const [photoSettings, stats, galleryResult] = await Promise.all([
        api.getPhotoSettings(token, business.id),
        api.getPhotoAnalytics(token, business.id),
        api.listPhotoGallery(token, business.id, {
          from: fromDate || undefined,
          to: toDate || undefined,
        }),
      ]);
      setSettings(photoSettings);
      setAnalytics(stats);
      setGallery(galleryResult.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, [token, business?.id, fromDate, toDate, setError]);

  useEffect(() => {
    if (!token || !business?.id || !isActive) return;
    let cancelled = false;
    void (async () => {
      try {
        const [photoSettings, stats, galleryResult] = await Promise.all([
          api.getPhotoSettings(token, business.id),
          api.getPhotoAnalytics(token, business.id),
          api.listPhotoGallery(token, business.id),
        ]);
        if (cancelled) return;
        setSettings(photoSettings);
        setAnalytics(stats);
        setGallery(galleryResult.items);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, business?.id, isActive, setError]);

  async function saveSettings() {
    if (!token || !business?.id || !settings) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const updated = await api.updatePhotoSettings(token, business.id, {
        enabled: settings.enabled,
        voice_prompt: settings.voice_prompt,
        countdown_seconds: settings.countdown_seconds,
        qr_expiry_hours: settings.qr_expiry_hours,
        campaign_text: settings.campaign_text || null,
        auto_delete_days: settings.auto_delete_days,
      });
      setSettings(updated);
      setMessage("Settings saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function onUpload(kind: "logo" | "frame", file: File | null) {
    if (!token || !business?.id || !file) return;
    setError(null);
    if (kind === "frame") {
      if (file.type !== "image/png") {
        setError("Frame must be a PNG with transparency (twibbon-style).");
        return;
      }
      try {
        const dims = await new Promise<{ width: number; height: number }>((resolve, reject) => {
          const objectUrl = URL.createObjectURL(file);
          const img = new Image();
          img.onload = () => {
            const width = img.naturalWidth;
            const height = img.naturalHeight;
            URL.revokeObjectURL(objectUrl);
            resolve({ width, height });
          };
          img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error("Could not read frame image."));
          };
          img.src = objectUrl;
        });
        if (dims.height <= 0) {
          setError("Could not read frame dimensions.");
          return;
        }
        const ratio = dims.width / dims.height;
        const storyRatio = 9 / 16;
        if (Math.abs(ratio - storyRatio) > 0.02) {
          setError(
            `Frame must be 9:16 (Instagram Story), e.g. 1080×1920. Got ${dims.width}×${dims.height}.`,
          );
          return;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not validate frame.");
        return;
      }
    }
    try {
      const updated = await api.uploadPhotoBranding(token, business.id, kind, file);
      setSettings(updated);
      setMessage(`${kind === "logo" ? "Logo" : "Frame"} uploaded`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    }
  }

  async function onDeleteBranding(kind: "logo" | "frame") {
    if (!token || !business?.id) return;
    try {
      const updated = await api.deletePhotoBranding(token, business.id, kind);
      setSettings(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function onDeletePhoto(id: string) {
    if (!token || !business?.id) return;
    if (!confirm("Delete this photo permanently?")) return;
    try {
      await api.deletePhotoGalleryItem(token, business.id, id);
      setGallery((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  const priceLabel = (status?.addon.price_display ?? "Rp199.000/month").replace(
    /\/\s*month/i,
    "",
  );

  const productName = status?.addon.name ?? "Smart Photo Moment";
  const productDescription =
    status?.addon.description ??
    "AI transaction-triggered souvenir photo with QR download.";

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

      {/* Product header — App Store style */}
      {loading ? (
        <div className="flex gap-4">
          <div className="size-[88px] shrink-0 animate-pulse rounded-[22px] bg-slate-100" />
          <div className="flex-1 space-y-3 py-1">
            <div className="h-7 w-48 animate-pulse rounded bg-slate-100" />
            <div className="h-4 w-64 animate-pulse rounded bg-slate-100" />
            <div className="h-4 w-24 animate-pulse rounded bg-slate-100" />
          </div>
        </div>
      ) : (
        <header className="flex items-start gap-4 sm:gap-5">
          <div className="flex size-[88px] shrink-0 items-center justify-center rounded-[22px] bg-gradient-to-br from-orange-400 to-amber-500 shadow-sm sm:size-[104px] sm:rounded-[26px]">
            <CameraIcon className="size-10 text-white sm:size-12" aria-hidden />
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
            <p className="text-[15px] leading-relaxed text-slate-600">
              {productDescription} After a successful kiosk payment, the assistant offers a souvenir
              photo. Guests are captured automatically, then receive a QR code to download a branded
              photo on their phone.
            </p>
            <p className="text-[15px] leading-relaxed text-slate-600">
              Photos are only for guest download and are deleted automatically when retention
              expires.
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

          <section>
            <h2 className="mb-3 text-xl font-semibold tracking-tight text-slate-900">Information</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-4 border-b border-slate-100 pb-3">
                <dt className="text-slate-400">Provider</dt>
                <dd className="font-medium text-slate-900">LORESCALE</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-slate-100 pb-3">
                <dt className="text-slate-400">Category</dt>
                <dd className="font-medium text-slate-900">Guest Experience</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-slate-100 pb-3">
                <dt className="text-slate-400">Billing</dt>
                <dd className="font-medium text-slate-900">Monthly · per workspace</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-400">Price</dt>
                <dd className="font-medium text-slate-900">{priceLabel}/mo</dd>
              </div>
            </dl>
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
              <p className="text-sm text-muted-foreground">
                After a successful kiosk payment, the assistant offers a souvenir photo with QR
                download.
              </p>
              <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <label
                  htmlFor="smart-photo-enabled"
                  className="text-sm font-medium text-slate-800"
                >
                  Enabled on kiosk
                </label>
                <Switch
                  id="smart-photo-enabled"
                  checked={settings.enabled}
                  disabled={saving}
                  onCheckedChange={(checked) =>
                    setSettings({ ...settings, enabled: checked })
                  }
                />
              </div>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-800">Voice prompt</span>
                <textarea
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-500/20"
                  rows={3}
                  value={settings.voice_prompt}
                  onChange={(e) => setSettings({ ...settings, voice_prompt: e.target.value })}
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-slate-800">Countdown seconds</span>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-500/20"
                    value={settings.countdown_seconds}
                    onChange={(e) =>
                      setSettings({ ...settings, countdown_seconds: Number(e.target.value) })
                    }
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-slate-800">QR expiry hours</span>
                  <input
                    type="number"
                    min={1}
                    max={168}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-500/20"
                    value={settings.qr_expiry_hours}
                    onChange={(e) =>
                      setSettings({ ...settings, qr_expiry_hours: Number(e.target.value) })
                    }
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-slate-800">Auto-delete days</span>
                  <input
                    type="number"
                    min={1}
                    max={90}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-500/20"
                    value={settings.auto_delete_days}
                    onChange={(e) =>
                      setSettings({ ...settings, auto_delete_days: Number(e.target.value) })
                    }
                  />
                </label>
              </div>
              <Button
                type="button"
                className="rounded-xl"
                onClick={() => void saveSettings()}
                disabled={saving}
              >
                {saving ? "Saving…" : "Save settings"}
              </Button>
            </div>
          ) : null}

          {manageTab === "branding" ? (
            <div className="space-y-5">
              <p className="text-sm text-muted-foreground">
                Branding is stamped onto each souvenir photo before guests download it.
              </p>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-800">Campaign text</span>
                <input
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-500/20"
                  value={settings.campaign_text}
                  maxLength={120}
                  placeholder="Optional caption on the photo"
                  onChange={(e) => setSettings({ ...settings, campaign_text: e.target.value })}
                />
              </label>
              <div className="grid items-start gap-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)]">
                {(["logo", "frame"] as const).map((kind) => {
                  const url = kind === "logo" ? settings.logo_url : settings.frame_url;
                  return (
                    <div key={kind} className="space-y-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-sm font-medium capitalize text-slate-800">{kind}</p>
                        {kind === "frame" ? (
                          <p className="text-[11px] text-muted-foreground">PNG · 9:16</p>
                        ) : null}
                      </div>
                      <label
                        className={cn(
                          "relative flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-slate-50 transition hover:border-orange-400 hover:bg-orange-50/40",
                          kind === "frame" ? "aspect-[9/16] w-full max-w-[14rem]" : "aspect-[4/3]",
                        )}
                      >
                        {url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={url}
                            alt={kind}
                            className={
                              kind === "frame"
                                ? "h-full w-full object-cover"
                                : "h-full w-full object-contain p-3"
                            }
                          />
                        ) : (
                          <span className="px-4 text-center text-sm text-slate-500">
                            {kind === "frame"
                              ? "Upload 9:16 PNG frame"
                              : "Click to upload logo"}
                          </span>
                        )}
                        <input
                          type="file"
                          accept={
                            kind === "frame"
                              ? "image/png"
                              : "image/png,image/jpeg,image/webp,image/gif"
                          }
                          className="hidden"
                          onChange={(e) => void onUpload(kind, e.target.files?.[0] ?? null)}
                        />
                      </label>
                      {url ? (
                        <button
                          type="button"
                          className="text-xs font-medium text-slate-500 transition hover:text-red-600"
                          onClick={() => void onDeleteBranding(kind)}
                        >
                          Remove {kind}
                        </button>
                      ) : kind === "frame" ? (
                        <p className="text-xs text-muted-foreground">
                          Instagram Story size (9:16), e.g. 1080×1920. Transparent center.
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <Button
                type="button"
                className="rounded-xl"
                onClick={() => void saveSettings()}
                disabled={saving}
              >
                {saving ? "Saving…" : "Save campaign text"}
              </Button>
            </div>
          ) : null}

          {manageTab === "gallery" ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  Guest souvenir photos for this workspace.
                </p>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="date"
                    className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-500/20"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                  />
                  <input
                    type="date"
                    className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-500/20"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl"
                    onClick={() => void loadActiveData()}
                  >
                    Search
                  </Button>
                </div>
              </div>
              {gallery.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-12 text-center text-sm text-muted-foreground">
                  No photos yet.
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {gallery.map((item) => (
                    <div
                      key={item.id}
                      className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
                    >
                      {item.thumbnail_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.thumbnail_url}
                          alt="Souvenir"
                          className="aspect-square w-full object-cover"
                        />
                      ) : (
                        <div className="flex aspect-square items-center justify-center bg-slate-50 text-xs text-muted-foreground">
                          No preview
                        </div>
                      )}
                      <div className="space-y-2 p-3">
                        <p className="text-xs text-muted-foreground">
                          {new Date(item.created_at).toLocaleString()}
                        </p>
                        <div className="flex gap-3">
                          {item.photo_url ? (
                            <a
                              href={item.photo_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs font-medium text-orange-600 hover:underline"
                            >
                              Download
                            </a>
                          ) : null}
                          <button
                            type="button"
                            className="text-xs font-medium text-slate-500 transition hover:text-red-600"
                            onClick={() => void onDeletePhoto(item.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {manageTab === "analytics" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ["Photos today", analytics?.photos_today ?? 0],
                ["Acceptance rate", `${analytics?.acceptance_rate ?? 0}%`],
                ["Downloads today", analytics?.downloads_today ?? 0],
                ["Downloads this month", analytics?.downloads_this_month ?? 0],
              ].map(([label, value]) => (
                <div
                  key={String(label)}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-4"
                >
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {label}
                  </p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                    {value}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : isActive ? (
        <AddonConfigPending />
      ) : null}
    </div>

    <footer
      style={footerStyle}
      className="fixed bottom-0 right-0 z-20 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
    >
      <div className="flex w-full items-center justify-between gap-3 px-4 py-3 lg:px-6">
        <Button type="button" variant="outline" asChild>
          <Link href={adminPath(business?.slug ?? "", "/add-ons")}>Back</Link>
        </Button>
        {isActive || isPending ? (
          <Button type="button" disabled>
            {isActive ? "Active" : "Requested"}
          </Button>
        ) : loading ? (
          <Button type="button" disabled>
            Subscribe
          </Button>
        ) : (
          <Button type="button" asChild>
            <Link href={adminPath(business?.slug ?? "", "/add-ons/smart-photo-moment/payment")}>Subscribe</Link>
          </Button>
        )}
      </div>
    </footer>
    </>
  );
}
