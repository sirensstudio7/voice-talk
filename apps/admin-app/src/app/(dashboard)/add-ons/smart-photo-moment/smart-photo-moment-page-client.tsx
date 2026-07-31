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

import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import {
  api,
  type AddonStatus,
  type PhotoAnalytics,
  type PhotoGalleryItem,
  type PhotoSettings,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";

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
  const { token, business } = useAuth();
  const { state: sidebarState, isMobile } = useSidebar();
  const [status, setStatus] = useState<AddonStatus | null>(null);
  const [settings, setSettings] = useState<PhotoSettings | null>(null);
  const [analytics, setAnalytics] = useState<PhotoAnalytics | null>(null);
  const [gallery, setGallery] = useState<PhotoGalleryItem[]>([]);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const isActive = status?.subscription_status === "active";
  const isPending = Boolean(status?.pending_request);

  const loadStatus = useCallback(async () => {
    if (!token || !business?.id) return;
    const addon = await api.getAddonStatus(token, business.id);
    setStatus(addon);
    return addon;
  }, [token, business?.id]);

  const loadActiveData = useCallback(async () => {
    if (!token || !business?.id) return;
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
  }, [token, business?.id, fromDate, toDate]);

  const load = useCallback(async () => {
    if (!token || !business?.id) return;
    setError(null);
    setLoading(true);
    try {
      const addon = await loadStatus();
      if (addon?.subscription_status === "active") {
        await loadActiveData();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [token, business?.id, loadStatus, loadActiveData]);

  useEffect(() => {
    void load();
  }, [load]);

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
    <div className="mx-auto max-w-3xl space-y-10 pb-24">
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

      {/* Screenshots carousel */}
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

      {/* About */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight text-slate-900">About</h2>
        <p className="text-[15px] leading-relaxed text-slate-600">
          {productDescription} After a successful kiosk payment, the assistant offers a souvenir
          photo. Guests are captured automatically, then receive a QR code to download a branded
          photo on their phone.
        </p>
        <p className="text-[15px] leading-relaxed text-slate-600">
          Photos are only for guest download and are deleted automatically when retention expires.
        </p>
      </section>

      {/* Features */}
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

      {/* Information */}
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

      {isActive && settings ? (
        <>
          <section className="space-y-4 rounded-2xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold">Configuration</h2>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
              />
              Enabled on kiosk
            </label>
            <label className="block text-sm">
              <span className="text-muted-foreground">Voice prompt</span>
              <textarea
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
                rows={2}
                value={settings.voice_prompt}
                onChange={(e) => setSettings({ ...settings, voice_prompt: e.target.value })}
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block text-sm">
                <span className="text-muted-foreground">Countdown seconds</span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
                  value={settings.countdown_seconds}
                  onChange={(e) =>
                    setSettings({ ...settings, countdown_seconds: Number(e.target.value) })
                  }
                />
              </label>
              <label className="block text-sm">
                <span className="text-muted-foreground">QR expiry hours</span>
                <input
                  type="number"
                  min={1}
                  max={168}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
                  value={settings.qr_expiry_hours}
                  onChange={(e) =>
                    setSettings({ ...settings, qr_expiry_hours: Number(e.target.value) })
                  }
                />
              </label>
              <label className="block text-sm">
                <span className="text-muted-foreground">Auto-delete days</span>
                <input
                  type="number"
                  min={1}
                  max={90}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
                  value={settings.auto_delete_days}
                  onChange={(e) =>
                    setSettings({ ...settings, auto_delete_days: Number(e.target.value) })
                  }
                />
              </label>
            </div>
            <Button onClick={() => void saveSettings()} disabled={saving}>
              {saving ? "Saving…" : "Save settings"}
            </Button>
          </section>

          <section className="space-y-4 rounded-2xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold">Branding</h2>
            <label className="block text-sm">
              <span className="text-muted-foreground">Campaign text</span>
              <input
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
                value={settings.campaign_text}
                maxLength={120}
                onChange={(e) => setSettings({ ...settings, campaign_text: e.target.value })}
              />
            </label>
            <div className="grid gap-6 sm:grid-cols-2">
              {(["logo", "frame"] as const).map((kind) => (
                <div key={kind} className="space-y-2">
                  <p className="text-sm font-medium capitalize">{kind}</p>
                  {(kind === "logo" ? settings.logo_url : settings.frame_url) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={kind === "logo" ? settings.logo_url : settings.frame_url}
                      alt={kind}
                      className="h-24 w-auto rounded border border-border object-contain"
                    />
                  ) : (
                    <p className="text-xs text-muted-foreground">No {kind} uploaded</p>
                  )}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={(e) => void onUpload(kind, e.target.files?.[0] ?? null)}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => void onDeleteBranding(kind)}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
            <Button onClick={() => void saveSettings()} disabled={saving}>
              Save campaign text
            </Button>
          </section>

          {analytics ? (
            <section className="rounded-2xl border border-border bg-card p-6">
              <h2 className="text-lg font-semibold">Analytics</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-4">
                {[
                  ["Photos today", analytics.photos_today],
                  ["Acceptance rate", `${analytics.acceptance_rate}%`],
                  ["Downloads today", analytics.downloads_today],
                  ["Downloads this month", analytics.downloads_this_month],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-xl bg-muted/40 px-4 py-3">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="mt-1 text-2xl font-semibold">{value}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="space-y-4 rounded-2xl border border-border bg-card p-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2 className="text-lg font-semibold">Gallery</h2>
              <div className="flex flex-wrap gap-2">
                <input
                  type="date"
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />
                <input
                  type="date"
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                />
                <Button type="button" variant="secondary" onClick={() => void loadActiveData()}>
                  Search
                </Button>
              </div>
            </div>
            {gallery.length === 0 ? (
              <p className="text-sm text-muted-foreground">No photos yet.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {gallery.map((item) => (
                  <div key={item.id} className="overflow-hidden rounded-xl border border-border">
                    {item.thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.thumbnail_url}
                        alt="Souvenir"
                        className="aspect-square w-full object-cover"
                      />
                    ) : (
                      <div className="flex aspect-square items-center justify-center bg-muted text-xs text-muted-foreground">
                        No preview
                      </div>
                    )}
                    <div className="space-y-2 p-3">
                      <p className="text-xs text-muted-foreground">
                        {new Date(item.created_at).toLocaleString()}
                      </p>
                      <div className="flex gap-2">
                        {item.photo_url ? (
                          <a
                            href={item.photo_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-medium text-primary underline"
                          >
                            Download
                          </a>
                        ) : null}
                        <button
                          type="button"
                          className="text-xs font-medium text-destructive"
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
          </section>
        </>
      ) : null}
    </div>

    <footer
      style={footerStyle}
      className="fixed bottom-0 right-0 z-20 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
    >
      <div className="flex w-full items-center justify-between gap-3 px-4 py-3 lg:px-6">
        <Button type="button" variant="outline" asChild>
          <Link href="/add-ons">Back</Link>
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
            <Link href="/add-ons/smart-photo-moment/payment">Subscribe</Link>
          </Button>
        )}
      </div>
    </footer>
    </>
  );
}
