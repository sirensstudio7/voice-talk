"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowDownOnSquareIcon,
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  ArrowUpTrayIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";

import { PageHeader } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSidebar } from "@/components/ui/sidebar";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { customerAppUrl } from "@/lib/customer-app";
import {
  normalizeDisplayOrientationSetting,
  useResolvedDisplayOrientation,
  type DisplayOrientation,
  type DisplayOrientationSetting,
} from "@/lib/display-orientation";
import { cn } from "@/lib/cn";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const DEFAULT_GRADIENT_COLOR = "#f1f5f9";
const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

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

function VoicePagePreview({
  backgroundUrl,
  gradientColor,
  orientation,
}: {
  backgroundUrl: string;
  gradientColor: string;
  orientation: DisplayOrientation;
}) {
  const previewGradient = buildBottomGradient(gradientColor);
  const isLandscape = orientation === "landscape";

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-[1.25rem] border-[3px] border-foreground bg-foreground shadow-md",
        isLandscape ? "h-[140px] w-[224px]" : "aspect-[9/16] w-[min(100%,158px)]",
      )}
    >
      {!isLandscape ? (
        <div className="absolute left-1/2 top-1.5 z-20 h-1 w-10 -translate-x-1/2 rounded-full bg-background/25" />
      ) : null}

      <div className="relative h-full w-full overflow-hidden bg-muted">
        {backgroundUrl ? (
          <Image src={backgroundUrl} alt="" fill unoptimized className="object-cover" />
        ) : null}

        {isLandscape ? (
          <>
            <div className="absolute inset-x-0 top-[12%] bottom-[38%] flex items-end justify-center">
              <div className="relative h-[58%] w-[44%]">
                <div className="absolute inset-x-[18%] bottom-0 h-[68%] rounded-t-full bg-primary/25" />
                <div className="absolute inset-x-[26%] top-[12%] h-[28%] rounded-full bg-primary/15" />
              </div>
            </div>
            <div className="absolute bottom-[28%] left-2 z-20 h-[22%] w-[38%] rounded-md bg-background/85 ring-1 ring-border/50" />
          </>
        ) : (
          <>
            <div className="absolute inset-x-0 top-[10%] bottom-[50%] flex items-end justify-center">
              <div className="relative h-[72%] w-[40%]">
                <div className="absolute inset-x-[18%] bottom-0 h-[68%] rounded-t-full bg-primary/25" />
                <div className="absolute inset-x-[26%] top-[12%] h-[28%] rounded-full bg-primary/15" />
              </div>
            </div>
            <div className="absolute inset-x-2 bottom-[24%] z-20 h-[16%] rounded-md bg-background/85 ring-1 ring-border/50" />
          </>
        )}

        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-0 z-10",
            isLandscape ? "h-[54%]" : "h-[45%]",
          )}
          style={{ background: previewGradient }}
        />

        <div className="absolute inset-x-0 bottom-2.5 z-20 flex items-end justify-center gap-1.5 px-2.5">
          <div className="h-5 flex-1 rounded-full bg-background/90 ring-1 ring-border/50" />
          <div className="size-7 rounded-full bg-primary ring-2 ring-background/80" />
        </div>
      </div>
    </div>
  );
}

function OrientationIllustration({ orientation }: { orientation: DisplayOrientationSetting }) {
  if (orientation === "auto") {
    return (
      <div className="flex h-20 w-28 items-center justify-center gap-1.5">
        <div className="overflow-hidden rounded-md border-2 border-foreground/15 bg-background shadow-sm h-14 w-24">
          <div className="relative h-full w-full bg-muted/80">
            <div className="absolute inset-x-[28%] top-[16%] h-[38%]">
              <div className="h-full rounded-t-full bg-primary/20" />
            </div>
            <div className="absolute bottom-[38%] left-1.5 h-[18%] w-[32%] rounded-sm bg-background/90" />
          </div>
        </div>
        <div className="overflow-hidden rounded-md border-2 border-foreground/15 bg-background shadow-sm aspect-[9/16] w-7">
          <div className="relative h-full w-full bg-muted/80">
            <div className="absolute inset-x-[30%] top-[12%] h-[32%]">
              <div className="h-full rounded-t-full bg-primary/20" />
            </div>
            <div className="absolute inset-x-1 bottom-[28%] h-[14%] rounded-sm bg-background/90" />
          </div>
        </div>
      </div>
    );
  }

  const isLandscape = orientation === "landscape";

  return (
    <div className="flex h-20 w-28 items-center justify-center">
      <div
        className={cn(
          "overflow-hidden rounded-md border-2 border-foreground/15 bg-background shadow-sm",
          isLandscape ? "h-14 w-24" : "aspect-[9/16] w-11",
        )}
      >
        <div className="relative h-full w-full bg-muted/80">
          {isLandscape ? (
            <>
              <div className="absolute inset-x-[28%] top-[16%] h-[38%]">
                <div className="h-full rounded-t-full bg-primary/20" />
              </div>
              <div className="absolute bottom-[38%] left-1.5 h-[18%] w-[32%] rounded-sm bg-background/90" />
              <div className="absolute inset-x-[18%] bottom-2 h-1 rounded-full bg-background/90" />
              <div className="absolute bottom-1.5 right-1.5 size-1.5 rounded-full bg-primary/80" />
            </>
          ) : (
            <>
              <div className="absolute inset-x-[30%] top-[12%] h-[32%]">
                <div className="h-full rounded-t-full bg-primary/20" />
              </div>
              <div className="absolute inset-x-1.5 bottom-[28%] h-[14%] rounded-sm bg-background/90" />
              <div className="absolute inset-x-[18%] bottom-2 h-1 rounded-full bg-background/90" />
              <div className="absolute bottom-1.5 right-1.5 size-1.5 rounded-full bg-primary/80" />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function AppearancePanelColumn({
  title,
  description,
  preview,
  fieldLabel,
  field,
  hint,
  action,
}: {
  title: string;
  description: string;
  preview: ReactNode;
  fieldLabel: string;
  field: ReactNode;
  hint: ReactNode;
  action: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="space-y-1">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription className="line-clamp-2 min-h-10">{description}</CardDescription>
      </div>

      <div className="relative h-28 shrink-0 overflow-hidden rounded-lg border border-border bg-muted/40">
        {preview}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">{fieldLabel}</p>
        <div className="h-9">{field}</div>
      </div>

      <p className="min-h-8 text-xs leading-4 text-muted-foreground">{hint}</p>

      <div className="relative z-10 min-h-8 shrink-0">{action}</div>
    </div>
  );
}

function FadePreviewMockup({ gradientColor }: { gradientColor: string }) {
  return (
    <>
      <div
        className="absolute inset-x-0 bottom-0 h-[72%]"
        style={{ background: buildBottomGradient(gradientColor) }}
        aria-hidden
      />
      <div className="absolute inset-x-0 top-4 flex justify-center">
        <div className="h-10 w-8 rounded-t-full bg-primary/15" />
      </div>
      <div className="absolute inset-x-0 bottom-3 flex items-end justify-center gap-1.5 px-4">
        <div className="h-2 flex-1 rounded-full bg-background/90 ring-1 ring-border/60" />
        <div className="size-4 rounded-full bg-primary ring-2 ring-background/80" />
      </div>
    </>
  );
}

function normalizeDisplayOrientation(value?: string | null): DisplayOrientationSetting {
  return normalizeDisplayOrientationSetting(value);
}

function OrientationToggle({
  value,
  onChange,
}: {
  value: DisplayOrientationSetting;
  onChange: (value: DisplayOrientationSetting) => void;
}) {
  const options: Array<{
    value: DisplayOrientationSetting;
    label: string;
    description: string;
  }> = [
    {
      value: "auto",
      label: "Auto",
      description: "Adapts to the viewer's screen — portrait on tall/narrow, landscape on wide",
    },
    {
      value: "landscape",
      label: "Landscape",
      description: "Default — kiosks, tablets & wide displays",
    },
    {
      value: "portrait",
      label: "Portrait",
      description: "9:16 phones & vertical displays",
    },
  ];

  return (
    <div
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      role="radiogroup"
      aria-label="Display orientation"
    >
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex h-full flex-col overflow-hidden rounded-xl border-2 bg-background text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              selected
                ? "border-primary bg-primary/[0.03]"
                : "border-border hover:border-muted-foreground/40",
            )}
          >
            <div className="flex h-32 items-center justify-center bg-muted/50 px-4">
              <OrientationIllustration orientation={option.value} />
            </div>
            <div className="flex flex-1 items-start gap-3 border-t border-border px-4 py-3">
              <span
                className={cn(
                  "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2",
                  selected ? "border-primary" : "border-muted-foreground/40",
                )}
                aria-hidden
              >
                {selected ? <span className="size-2 rounded-full bg-primary" /> : null}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{option.label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{option.description}</span>
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function AppearanceLoadingSkeleton() {
  return (
    <div className="space-y-10">
      <div className="h-80 animate-pulse rounded-lg bg-muted/60" />
      <div className="h-44 animate-pulse rounded-lg bg-muted/60" />
      <div className="h-[22rem] animate-pulse rounded-xl border border-border bg-muted/40 lg:grid lg:grid-cols-2 lg:divide-x lg:divide-border">
        <div className="border-b border-border lg:border-b-0" />
        <div />
      </div>
    </div>
  );
}

export function AppearancePageClient() {
  const { token, business } = useAuth();
  const { state: sidebarState, isMobile } = useSidebar();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [backgroundUrl, setBackgroundUrl] = useState("");
  const [savedGradientColor, setSavedGradientColor] = useState("");
  const [gradientInput, setGradientInput] = useState(DEFAULT_GRADIENT_COLOR);
  const [savedOrientation, setSavedOrientation] = useState<DisplayOrientationSetting>("landscape");
  const [orientationInput, setOrientationInput] = useState<DisplayOrientationSetting>("landscape");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [savingAppearance, setSavingAppearance] = useState(false);
  const [dragActive, setDragActive] = useState(false);
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
      setSavedOrientation(normalizeDisplayOrientation(settings.display_orientation));
      setOrientationInput(normalizeDisplayOrientation(settings.display_orientation));
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

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setError("Upload a PNG, JPG, WEBP, or GIF image.");
      return;
    }

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

  const handleSaveAppearance = async () => {
    if (!token || !business) return;

    const normalized = normalizeHexInput(gradientInput);
    if (!parseHexColor(normalized)) {
      setError("Enter a valid hex color like #f1f5f9.");
      return;
    }

    setSavingAppearance(true);
    setError(null);
    setMessage(null);

    try {
      const settings = await api.updateAppearanceSettings(token, business.id, {
        gradient_color: normalized.toLowerCase() === DEFAULT_GRADIENT_COLOR ? "" : normalized,
        display_orientation: orientationInput,
      });
      setSavedGradientColor(settings.gradient_color);
      setGradientInput(settings.gradient_color || DEFAULT_GRADIENT_COLOR);
      setSavedOrientation(normalizeDisplayOrientation(settings.display_orientation));
      setOrientationInput(normalizeDisplayOrientation(settings.display_orientation));
      setMessage("Appearance settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save appearance settings.");
    } finally {
      setSavingAppearance(false);
    }
  };

  const handleResetGradient = () => {
    setGradientInput(DEFAULT_GRADIENT_COLOR);
    setError(null);
    setMessage(null);
  };

  const handleDiscardChanges = () => {
    setGradientInput(savedGradientColor || DEFAULT_GRADIENT_COLOR);
    setOrientationInput(savedOrientation);
    setError(null);
    setMessage(null);
  };

  const previewUrl = resolveBackgroundUrl(backgroundUrl);
  const previewOrientation = useResolvedDisplayOrientation(orientationInput);
  const normalizedGradient = normalizeHexInput(gradientInput);
  const gradientDirty =
    normalizedGradient.toLowerCase() !==
    (savedGradientColor || DEFAULT_GRADIENT_COLOR).toLowerCase();
  const orientationDirty = orientationInput !== savedOrientation;
  const appearanceDirty = gradientDirty || orientationDirty;

  const footerStyle = {
    left: isMobile
      ? "0px"
      : sidebarState === "collapsed"
        ? "var(--sidebar-width-icon)"
        : "var(--sidebar-width)",
  } as const;

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0] ?? null;
    void handleUpload(file);
  };

  return (
    <>
      <div className={cn("max-w-2xl space-y-6", appearanceDirty && !loading ? "pb-32" : "pb-10")}>
        <PageHeader
          title="Appearance"
          subtitle="Customize how the customer voice page looks on phones and kiosks."
          action={
            business?.slug ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={customerAppUrl(business.slug)} target="_blank" rel="noreferrer">
                  <ArrowTopRightOnSquareIcon />
                  Open voice page
                </Link>
              </Button>
            ) : undefined
          }
        />

        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        {message ? (
          <div className="rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm text-foreground">
            {message}
          </div>
        ) : null}

        {loading ? (
          <AppearanceLoadingSkeleton />
        ) : (
          <div className="space-y-10">
            <section className="space-y-4">
              <CardHeader className="px-0">
                <CardTitle>Preview</CardTitle>
                <CardDescription>
                  How your voice page looks to customers. Updates as you change settings below.
                  {orientationInput === "auto" ? " Preview reflects your current screen size." : null}
                </CardDescription>
              </CardHeader>
              <div className="flex justify-center rounded-lg bg-muted/40 px-6 py-10">
                <VoicePagePreview
                  backgroundUrl={previewUrl}
                  gradientColor={gradientInput}
                  orientation={previewOrientation}
                />
              </div>
            </section>

            <section className="space-y-4">
              <CardHeader className="px-0">
                <CardTitle>Display orientation</CardTitle>
                <CardDescription>
                  Auto adapts to each viewer&apos;s screen. Landscape fills wide displays; Portrait uses
                  a 9:16 frame on tall or narrow screens.
                </CardDescription>
              </CardHeader>
              <OrientationToggle value={orientationInput} onChange={setOrientationInput} />
            </section>

            <div className="overflow-hidden rounded-xl border border-border divide-y divide-border lg:grid lg:grid-cols-2 lg:divide-x lg:divide-y-0">
              <AppearancePanelColumn
                title="Background image"
                description="Shown behind the avatar on the customer voice page."
                preview={
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="hidden"
                      onChange={(event) => {
                        void handleUpload(event.target.files?.[0] ?? null);
                      }}
                    />
                    <div
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          fileInputRef.current?.click();
                        }
                      }}
                      onClick={() => fileInputRef.current?.click()}
                      onDragEnter={(event) => {
                        event.preventDefault();
                        setDragActive(true);
                      }}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setDragActive(true);
                      }}
                      onDragLeave={(event) => {
                        event.preventDefault();
                        setDragActive(false);
                      }}
                      onDrop={handleDrop}
                      className={cn(
                        "group relative h-full w-full cursor-pointer",
                        dragActive && "bg-primary/5",
                        uploading && "pointer-events-none opacity-60",
                      )}
                    >
                      {previewUrl ? (
                        <>
                          <Image
                            src={previewUrl}
                            alt="Background preview"
                            fill
                            unoptimized
                            className="object-cover"
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-foreground/0 transition group-hover:bg-foreground/25">
                            <span className="rounded-md bg-background/95 px-2.5 py-1 text-xs font-medium opacity-0 shadow-sm ring-1 ring-border transition group-hover:opacity-100">
                              {uploading ? "Uploading…" : "Replace image"}
                            </span>
                          </div>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={uploading}
                            className="absolute bottom-2 left-2 z-20 h-7 bg-background/95 text-destructive shadow-sm hover:bg-background"
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleRemove();
                            }}
                          >
                            <TrashIcon />
                            {uploading ? "Removing…" : "Remove"}
                          </Button>
                        </>
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
                          <ArrowUpTrayIcon className="size-5 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground">
                            {uploading ? "Uploading…" : "Drop or click to upload"}
                          </p>
                        </div>
                      )}
                    </div>
                  </>
                }
                fieldLabel="Image file"
                field={
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                    className="flex h-full w-full items-center justify-between overflow-hidden rounded-md border border-input bg-background px-3 text-sm shadow-sm transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="truncate text-muted-foreground">
                      {uploading
                        ? "Uploading…"
                        : previewUrl
                          ? "Image selected"
                          : "Choose an image"}
                    </span>
                    <ArrowUpTrayIcon className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                }
                hint="PNG, JPG, WEBP, or GIF · up to 5 MB"
                action={
                  previewUrl ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={uploading}
                      className="h-8 justify-start px-0 text-destructive hover:text-destructive"
                      onClick={() => {
                        void handleRemove();
                      }}
                    >
                      <TrashIcon />
                      {uploading ? "Removing background…" : "Remove background"}
                    </Button>
                  ) : (
                    <span className="inline-flex h-8 items-center text-xs text-muted-foreground">
                      No background image uploaded
                    </span>
                  )
                }
              />

              <AppearancePanelColumn
                title="Bottom fade"
                description="Gradient over the avatar and controls at the bottom of the voice page."
                preview={
                  <div className="relative h-full w-full">
                    <FadePreviewMockup gradientColor={gradientInput} />
                  </div>
                }
                fieldLabel="Fade color"
                field={
                  <div className="flex h-full overflow-hidden rounded-md border border-input bg-background shadow-sm">
                    <label className="relative shrink-0 border-r border-input">
                      <span className="sr-only">Pick gradient color</span>
                      <input
                        id="gradient-color-picker"
                        type="color"
                        value={
                          parseHexColor(normalizedGradient)
                            ? normalizedGradient
                            : DEFAULT_GRADIENT_COLOR
                        }
                        onChange={(event) => {
                          setGradientInput(event.target.value);
                        }}
                        className="block h-full w-10 cursor-pointer border-0 bg-transparent p-1"
                      />
                    </label>
                    <input
                      id="gradient-color"
                      type="text"
                      value={gradientInput}
                      onChange={(event) => {
                        setGradientInput(event.target.value);
                      }}
                      placeholder="#f1f5f9"
                      className="min-w-0 flex-1 border-0 bg-transparent px-3 font-mono text-sm uppercase outline-none focus-visible:ring-0"
                    />
                  </div>
                }
                hint={
                  <>
                    Default is light gray{" "}
                    <span className="font-mono text-foreground/80">#f1f5f9</span>
                  </>
                }
                action={
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={savingAppearance}
                    onClick={handleResetGradient}
                    className="h-8 justify-start px-0 text-muted-foreground hover:text-foreground"
                  >
                    <ArrowPathIcon />
                    Reset to default
                  </Button>
                }
              />
            </div>
          </div>
        )}
      </div>

      {appearanceDirty && !loading ? (
        <footer
          style={footerStyle}
          className="fixed bottom-0 right-0 z-20 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
        >
          <div className="flex w-full items-center justify-between gap-3 px-4 py-3 lg:px-6">
            <p className="hidden text-sm text-muted-foreground sm:block">You have unsaved changes</p>
            <div className="flex w-full items-center justify-between gap-3 sm:ml-auto sm:w-auto">
              <Button type="button" variant="outline" onClick={handleDiscardChanges}>
                Discard
              </Button>
              <Button
                type="button"
                disabled={savingAppearance}
                onClick={() => {
                  void handleSaveAppearance();
                }}
              >
                <ArrowDownOnSquareIcon />
                {savingAppearance ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        </footer>
      ) : null}
    </>
  );
}
