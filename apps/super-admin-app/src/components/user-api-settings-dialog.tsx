"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";

import { Button } from "@/components/ui/button";
import { api, type UserApiKeyCatalogItem } from "@/lib/api";
import { cn } from "@/lib/cn";

const PROVIDER_LABELS: Record<string, string> = {
  gemini: "Gemini",
  elevenlabs: "ElevenLabs",
  openai: "OpenAI",
  deepgram: "Deepgram",
  cartesia: "Cartesia",
  azure: "Azure Speech",
  playht: "PlayHT",
  custom: "Custom",
};

const selectClass =
  "w-full appearance-none rounded-md border border-input bg-background px-3 py-2 pr-10 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60";

function catalogLabel(item: UserApiKeyCatalogItem) {
  const provider = PROVIDER_LABELS[item.provider] ?? item.provider;
  const name = item.label.trim();
  if (!name || name.toLowerCase() === item.provider) return provider;
  return `${name} (${provider})`;
}

export function UserApiSettingsDialog({
  userId,
  userName,
  userEmail,
  token,
  canWrite,
  open,
  onClose,
  onSaved,
}: {
  userId: string;
  userName: string;
  userEmail: string;
  token: string;
  canWrite: boolean;
  open: boolean;
  onClose: () => void;
  onSaved?: () => void | Promise<void>;
}) {
  const [sourceId, setSourceId] = useState("");
  const [catalog, setCatalog] = useState<UserApiKeyCatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await api.getUserApiKeys(token, userId);
        if (cancelled) return;
        setCatalog(result.catalog);
        setSourceId(result.source_id ?? "");
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load API keys");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, token, userId]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function save() {
    if (!canWrite || saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await api.updateUserApiKeys(token, userId, sourceId || null);
      setCatalog(result.catalog);
      setSourceId(result.source_id ?? "");
      await onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save API key");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close settings"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-api-settings-title"
        className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-card shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 id="user-api-settings-title" className="text-lg font-semibold">
              User settings
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {userName || userEmail}
              {userName ? ` · ${userEmail}` : ""}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="size-8" onClick={onClose} aria-label="Close">
            <XMarkIcon className="size-4" />
          </Button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4">
          {!canWrite ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Only Super Admin can change API keys.
            </p>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          {loading ? (
            <div className="flex min-h-32 items-center justify-center">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-orange-200 border-t-orange-500" />
            </div>
          ) : (
            <>
              <div>
                <p className="text-sm font-medium">API key</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Choose a key from Settings. Gemini keys are used for this account’s kiosk, LIVE, and Presenter.
                </p>
              </div>
              {catalog.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center">
                  <p className="text-sm font-medium">No API keys saved yet</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Add named keys in Settings first, then assign one here.
                  </p>
                  <Button asChild variant="outline" size="sm" className="mt-3">
                    <Link href="/settings">Open Settings</Link>
                  </Button>
                </div>
              ) : (
                <select
                  className={selectClass}
                  value={sourceId}
                  disabled={!canWrite}
                  onChange={(event) => setSourceId(event.target.value)}
                >
                  <option value="">Platform default</option>
                  {sourceId && !catalog.some((item) => item.id === sourceId) ? (
                    <option value={sourceId}>Saved key (removed from Settings)</option>
                  ) : null}
                  {catalog.map((item) => (
                    <option key={item.id} value={item.id}>
                      {catalogLabel(item)}
                    </option>
                  ))}
                </select>
              )}
            </>
          )}
        </div>

        <div className={cn("flex justify-end gap-2 border-t border-border px-5 py-4")}>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          {canWrite ? (
            <Button type="button" disabled={loading || saving} onClick={() => void save()}>
              {saving ? "Saving…" : "Save"}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
