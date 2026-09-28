"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  CameraIcon,
  EyeIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";

import { StatusBadge } from "@/components/status-badge";
import { PageHeader } from "@/components/ui-blocks";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { VisionPreviewSource } from "@/components/vision-preview-types";
import { api, type VisionWorkspaceItem } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const VisionPreviewPanel = dynamic(
  () =>
    import("@/components/vision-preview-panel").then((mod) => mod.VisionPreviewPanel),
  { ssr: false },
);

const SOURCE_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "browser", label: "Browser camera" },
  { value: "human", label: "Human (browser)" },
] as const;

const PREVIEW_BUTTONS: Array<{
  source: VisionPreviewSource;
  label: string;
  hint: string;
  icon: typeof EyeIcon;
  live: boolean;
}> = [
  {
    source: "auto",
    label: "Auto",
    hint: "How fallback works",
    icon: SparklesIcon,
    live: false,
  },
  {
    source: "browser",
    label: "Browser",
    hint: "Live webcam",
    icon: CameraIcon,
    live: true,
  },
  {
    source: "human",
    label: "Human",
    hint: "Live webcam",
    icon: EyeIcon,
    live: true,
  },
];

function sourceLabel(source: VisionWorkspaceItem["vision_source"]) {
  return SOURCE_OPTIONS.find((o) => o.value === source)?.label ?? source;
}

function triggerLabel(mode: VisionWorkspaceItem["greeting_trigger_mode"]) {
  if (mode === "gesture") return "Wave";
  if (mode === "raise_hand") return "Raise hand";
  return "Presence";
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export default function VisionPage() {
  const { token } = useAuth();
  const [items, setItems] = useState<VisionWorkspaceItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [visionSource, setVisionSource] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewSource, setPreviewSource] = useState<VisionPreviewSource | null>(null);
  const limit = 25;

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const result = await api.listVisionWorkspaces(token, {
        page,
        limit,
        search,
        vision_source: visionSource || undefined,
      });
      setItems(result.items);
      setTotal(result.total);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load vision settings");
    } finally {
      setLoading(false);
    }
  }, [token, page, search, visionSource]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <>
      <PageHeader
        title="Vision"
        subtitle="See which workspaces use Auto, Python, Browser, or Human for camera greeting triggers."
      />

      <div className="mb-4 rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        Merchants choose the vision source in{" "}
        <span className="font-medium text-foreground">Admin → Vision Settings</span>. Human runs in
        the display browser tab (no local Python sidecar), same as Browser camera.
      </div>

      <section className="mb-6 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Source previews</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Open a live demo on <span className="font-medium">this computer&apos;s camera</span>{" "}
            (Browser / Human), or read how Auto and Python work. Does not change merchant settings.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {PREVIEW_BUTTONS.map(({ source, label, hint, icon: Icon, live }) => (
            <button
              key={source}
              type="button"
              onClick={() => setPreviewSource(source)}
              className="flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left transition hover:border-orange-300 hover:bg-orange-50/50"
            >
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40">
                <Icon className="size-4 text-orange-600" />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">{label}</span>
                  {live ? (
                    <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                      Live
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                      Info
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          className="h-9 w-full max-w-xs rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          placeholder="Search workspace…"
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
        />
        <Select
          value={visionSource || "all"}
          onValueChange={(v) => {
            setPage(1);
            setVisionSource(v === "all" ? "" : v);
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All sources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            {SOURCE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error ? (
        <p className="mb-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Workspace</th>
              <th className="px-4 py-3 font-medium">Slug</th>
              <th className="px-4 py-3 font-medium">Camera trigger</th>
              <th className="px-4 py-3 font-medium">Vision source</th>
              <th className="px-4 py-3 font-medium">Greeting trigger</th>
              <th className="px-4 py-3 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No workspaces found.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <Link
                      href={`/businesses/${item.id}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {item.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{item.slug}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={item.camera_trigger_enabled ? "active" : "disabled"} />
                  </td>
                  <td className="px-4 py-3 font-medium">{sourceLabel(item.vision_source)}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {triggerLabel(item.greeting_trigger_mode)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDate(item.updated_at)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Page {page} of {totalPages} · {total} total
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      <VisionPreviewPanel source={previewSource} onClose={() => setPreviewSource(null)} />
    </>
  );
}
