"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const DEFAULT_GRADIENT_COLOR = "#f1f5f9";

function resolveBackgroundUrl(path: string): string {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${API_URL}${path}`;
}

function parseHexColor(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex.trim();
  const longMatch = /^#([0-9a-fA-F]{6})$/.exec(normalized);
  if (longMatch) {
    const value = longMatch[1];
    return {
      r: parseInt(value.slice(0, 2), 16),
      g: parseInt(value.slice(2, 4), 16),
      b: parseInt(value.slice(4, 6), 16),
    };
  }

  const shortMatch = /^#([0-9a-fA-F]{3})$/.exec(normalized);
  if (shortMatch) {
    const value = shortMatch[1];
    return {
      r: parseInt(value[0] + value[0], 16),
      g: parseInt(value[1] + value[1], 16),
      b: parseInt(value[2] + value[2], 16),
    };
  }

  return null;
}

function buildBottomGradient(color: string): string {
  const rgb =
    parseHexColor(color) ??
    parseHexColor(DEFAULT_GRADIENT_COLOR) ?? { r: 241, g: 245, b: 249 };
  const { r, g, b } = rgb;

  return [
    `linear-gradient(to top,`,
    `rgb(${r} ${g} ${b}) 0%,`,
    `rgba(${r}, ${g}, ${b}, 0.98) 10%,`,
    `rgba(${r}, ${g}, ${b}, 0.88) 22%,`,
    `rgba(${r}, ${g}, ${b}, 0.68) 38%,`,
    `rgba(${r}, ${g}, ${b}, 0.42) 54%,`,
    `rgba(${r}, ${g}, ${b}, 0.18) 70%,`,
    `rgba(${r}, ${g}, ${b}, 0.04) 84%,`,
    `rgba(${r}, ${g}, ${b}, 0) 100%)`,
  ].join(" ");
}

function normalizeHexInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_GRADIENT_COLOR;
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

export function AppearancePageClient() {
  const { token, business } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [backgroundUrl, setBackgroundUrl] = useState("");
  const [savedGradientColor, setSavedGradientColor] = useState("");
  const [gradientInput, setGradientInput] = useState(DEFAULT_GRADIENT_COLOR);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [savingGradient, setSavingGradient] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    if (!token || !business) return;
    setLoading(true);
    setError(null);
    try {
      const settings = await api.getAppearanceSettings(token, business.id);
      setBackgroundUrl(settings.background_url);
      setSavedGradientColor(settings.gradient_color);
      setGradientInput(settings.gradient_color || DEFAULT_GRADIENT_COLOR);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load appearance settings.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [token, business]);

  const handleUpload = async (file: File | null) => {
    if (!file || !token || !business) return;

    setUploading(true);
    setError(null);
    setMessage(null);

    try {
      const settings = await api.uploadBackground(token, business.id, file);
      setBackgroundUrl(settings.background_url);
      setMessage("Background uploaded.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemove = async () => {
    if (!token || !business) return;

    setUploading(true);
    setError(null);
    setMessage(null);

    try {
      await api.deleteBackground(token, business.id);
      setBackgroundUrl("");
      setMessage("Background removed. Customers will see the default light gray background.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to remove background.");
    } finally {
      setUploading(false);
    }
  };

  const handleSaveGradient = async () => {
    if (!token || !business) return;

    const normalized = normalizeHexInput(gradientInput);
    if (!parseHexColor(normalized)) {
      setError("Enter a valid hex color like #f1f5f9.");
      return;
    }

    setSavingGradient(true);
    setError(null);
    setMessage(null);

    try {
      const settings = await api.updateAppearanceSettings(token, business.id, {
        gradient_color: normalized.toLowerCase() === DEFAULT_GRADIENT_COLOR ? "" : normalized,
      });
      setSavedGradientColor(settings.gradient_color);
      setGradientInput(settings.gradient_color || DEFAULT_GRADIENT_COLOR);
      setMessage("Gradient color saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save gradient color.");
    } finally {
      setSavingGradient(false);
    }
  };

  const handleResetGradient = async () => {
    if (!token || !business) return;

    setSavingGradient(true);
    setError(null);
    setMessage(null);

    try {
      const settings = await api.updateAppearanceSettings(token, business.id, {
        gradient_color: "",
      });
      setSavedGradientColor(settings.gradient_color);
      setGradientInput(DEFAULT_GRADIENT_COLOR);
      setMessage("Gradient color reset to default.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reset gradient color.");
    } finally {
      setSavingGradient(false);
    }
  };

  const previewUrl = resolveBackgroundUrl(backgroundUrl);
  const previewGradient = buildBottomGradient(gradientInput);
  const gradientDirty =
    normalizeHexInput(gradientInput).toLowerCase() !==
    (savedGradientColor || DEFAULT_GRADIENT_COLOR).toLowerCase();

  return (
    <>
      <PageHeader
        title="Appearance"
        subtitle="Customize the customer voice page background and bottom fade."
      />

      <div className="max-w-2xl space-y-6">
        {loading ? (
          <p className="text-sm text-slate-500">Loading appearance settings…</p>
        ) : (
          <>
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
                <div className="flex h-52 w-52 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-slate-50">
                  {previewUrl ? (
                    <Image
                      src={previewUrl}
                      alt="Voice page background preview"
                      width={208}
                      height={208}
                      unoptimized
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="px-4 text-center">
                      <p className="text-sm font-semibold text-slate-700">Default background</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Light gray (slate-100) is shown when no image is uploaded.
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex-1 space-y-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Voice page background</p>
                    <p className="mt-1 text-sm text-slate-500">
                      PNG, JPG, WEBP, or GIF up to 5 MB. Use a wide image for best results on
                      phones and desktops.
                    </p>
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={(event) => {
                      void handleUpload(event.target.files?.[0] ?? null);
                    }}
                  />

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      disabled={uploading}
                      onClick={() => fileInputRef.current?.click()}
                      className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {uploading ? "Uploading…" : previewUrl ? "Replace background" : "Upload background"}
                    </button>

                    {previewUrl ? (
                      <button
                        type="button"
                        disabled={uploading}
                        onClick={() => {
                          void handleRemove();
                        }}
                        className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
                <div className="relative h-52 w-52 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-300">
                  {previewUrl ? (
                    <Image
                      src={previewUrl}
                      alt="Gradient preview background"
                      fill
                      unoptimized
                      className="object-cover"
                    />
                  ) : null}
                  <div
                    className="absolute inset-x-0 bottom-0 h-[min(52vh,36rem)] max-h-full"
                    style={{ background: previewGradient }}
                  />
                </div>

                <div className="flex-1 space-y-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Bottom fade gradient</p>
                    <p className="mt-1 text-sm text-slate-500">
                      Controls the smooth fade at the bottom of the voice page over the avatar and
                      controls. Default is light gray (#f1f5f9).
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <input
                      type="color"
                      value={parseHexColor(normalizeHexInput(gradientInput)) ? normalizeHexInput(gradientInput) : DEFAULT_GRADIENT_COLOR}
                      onChange={(event) => {
                        setGradientInput(event.target.value);
                      }}
                      className="h-11 w-14 cursor-pointer rounded-lg border border-slate-200 bg-white p-1"
                      aria-label="Gradient color"
                    />
                    <input
                      type="text"
                      value={gradientInput}
                      onChange={(event) => {
                        setGradientInput(event.target.value);
                      }}
                      placeholder="#f1f5f9"
                      className="w-32 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                    />
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      disabled={savingGradient || !gradientDirty}
                      onClick={() => {
                        void handleSaveGradient();
                      }}
                      className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {savingGradient ? "Saving…" : "Save gradient"}
                    </button>

                    <button
                      type="button"
                      disabled={savingGradient}
                      onClick={() => {
                        void handleResetGradient();
                      }}
                      className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Reset to default
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {message ? (
              <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p>
            ) : null}
            {error ? (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}
