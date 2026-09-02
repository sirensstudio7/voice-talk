"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { PageHeader } from "@/components/UiBlocks";
import { Button } from "@voicetalk/ui";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@voicetalk/ui";
import { Switch } from "@voicetalk/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";

const AI_MODELS = [
  "gemini-3.1-flash-live-preview",
  "gemini-2.5-flash-preview-native-audio-dialog",
  "gemini-2.0-flash-live-001",
];

const VOICE_PROVIDERS = ["gemini", "elevenlabs", "custom"];

const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60";

const selectClass = `${inputClass} appearance-none !pr-12`;

function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("block text-sm", className)}>
      <label className="font-medium text-foreground">{label}</label>
      {hint ? (
        <p className="mt-0.5 min-h-10 text-xs text-muted-foreground">{hint}</p>
      ) : null}
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const { token, admin } = useAuth();
  const canWrite = admin?.role === "super";
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [baseline, setBaseline] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [flagsError, setFlagsError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const next = await api.getSettings(token);
      setSettings(next);
      setBaseline(next);
      setError(null);
      setFlagsError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(() => {
    const keys = new Set([...Object.keys(settings), ...Object.keys(baseline)]);
    for (const key of keys) {
      if ((settings[key] ?? "") !== (baseline[key] ?? "")) return true;
    }
    return false;
  }, [settings, baseline]);

  const maintenanceOn = ["true", "1", "yes", "on"].includes(
    (settings.maintenance_mode ?? "false").toLowerCase(),
  );

  const approvalRequired = ["true", "1", "yes", "on"].includes(
    (settings.require_registration_approval ?? "false").toLowerCase(),
  );

  function setValue(key: string, value: string) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setMessage(null);
  }

  function validateFlags(raw: string): boolean {
    const trimmed = raw.trim();
    if (!trimmed) {
      setFlagsError(null);
      return true;
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setFlagsError("Feature flags must be a JSON object, e.g. {\"beta\": true}.");
        return false;
      }
      setFlagsError(null);
      return true;
    } catch {
      setFlagsError("Invalid JSON. Use an object like {\"new_checkout\": true}.");
      return false;
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token || !canWrite || saving) return;
    if (!validateFlags(settings.feature_flags ?? "{}")) return;

    setSaving(true);
    try {
      const payload = {
        default_ai_model: settings.default_ai_model ?? "",
        default_voice_provider: settings.default_voice_provider ?? "",
        storage_quota_mb: settings.storage_quota_mb ?? "1024",
        manual_mrr: settings.manual_mrr ?? "0",
        maintenance_mode: maintenanceOn ? "true" : "false",
        require_registration_approval: approvalRequired ? "true" : "false",
        feature_flags: (settings.feature_flags ?? "{}").trim() || "{}",
      };
      const next = await api.updateSettings(token, payload);
      setSettings(next);
      setBaseline(next);
      setMessage("Settings saved.");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  function resetChanges() {
    setSettings(baseline);
    setFlagsError(null);
    setMessage(null);
    setError(null);
  }

  const modelOptions = useMemo(() => {
    const current = settings.default_ai_model;
    if (current && !AI_MODELS.includes(current)) {
      return [current, ...AI_MODELS];
    }
    return AI_MODELS;
  }, [settings.default_ai_model]);

  const voiceOptions = useMemo(() => {
    const current = settings.default_voice_provider;
    if (current && !VOICE_PROVIDERS.includes(current)) {
      return [current, ...VOICE_PROVIDERS];
    }
    return VOICE_PROVIDERS;
  }, [settings.default_voice_provider]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Settings"
        subtitle="Global platform defaults for AI, quotas, and operations."
        titleAction={
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            Refresh
          </Button>
        }
      />

      {!canWrite ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          You have read-only access. Only Super Admin can change these settings.
        </div>
      ) : null}

      {message ? (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex min-h-48 items-center justify-center rounded-xl border border-dashed border-border">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-200 border-t-orange-500" />
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mx-auto flex w-full max-w-3xl flex-col gap-5 pb-24">
          <Card className="gap-0 py-0">
            <CardHeader className="border-b border-border py-5">
              <CardTitle>AI defaults</CardTitle>
              <CardDescription>
                Default model and voice provider applied to new workspaces.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 py-5 sm:grid-cols-2">
              <Field
                label="Default AI model"
                hint="Used when a workspace has not set a custom model."
              >
                <select
                  className={selectClass}
                  value={settings.default_ai_model ?? ""}
                  disabled={!canWrite}
                  onChange={(e) => setValue("default_ai_model", e.target.value)}
                >
                  {modelOptions.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Default voice provider"
                hint="Primary speech provider for new assistants."
              >
                <select
                  className={selectClass}
                  value={settings.default_voice_provider ?? "gemini"}
                  disabled={!canWrite}
                  onChange={(e) => setValue("default_voice_provider", e.target.value)}
                >
                  {voiceOptions.map((provider) => (
                    <option key={provider} value={provider}>
                      {provider.charAt(0).toUpperCase() + provider.slice(1)}
                    </option>
                  ))}
                </select>
              </Field>
            </CardContent>
          </Card>

          <Card className="gap-0 py-0">
            <CardHeader className="border-b border-border py-5">
              <CardTitle>Quotas & revenue</CardTitle>
              <CardDescription>
                Soft limits and the manual MRR figure shown on the dashboard.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 py-5 sm:grid-cols-2">
              <Field
                label="Storage quota (MB)"
                hint="Default per-workspace storage allowance."
              >
                <input
                  type="number"
                  min={0}
                  step={1}
                  className={inputClass}
                  value={settings.storage_quota_mb ?? ""}
                  disabled={!canWrite}
                  onChange={(e) => setValue("storage_quota_mb", e.target.value)}
                />
              </Field>
              <Field
                label="Manual MRR (USD)"
                hint="Dashboard metric until Stripe billing is connected."
              >
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
                    $
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    className={`${inputClass} pl-7`}
                    value={settings.manual_mrr ?? ""}
                    disabled={!canWrite}
                    onChange={(e) => setValue("manual_mrr", e.target.value)}
                  />
                </div>
              </Field>
            </CardContent>
          </Card>

          <Card className="gap-0 py-0">
            <CardHeader className="border-b border-border py-5">
              <CardTitle>Operations</CardTitle>
              <CardDescription>
                Platform-wide controls for availability and experimental features.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5 py-5">
              <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-muted/30 px-4 py-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Maintenance mode</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    When enabled, customer apps can show a maintenance banner or block new sessions.
                  </p>
                  <p
                    className={cn(
                      "mt-2 inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                      maintenanceOn
                        ? "bg-amber-100 text-amber-800"
                        : "bg-green-100 text-green-700",
                    )}
                  >
                    {maintenanceOn ? "Maintenance on" : "Platform live"}
                  </p>
                </div>
                <Switch
                  checked={maintenanceOn}
                  disabled={!canWrite}
                  onCheckedChange={(checked) =>
                    setValue("maintenance_mode", checked ? "true" : "false")
                  }
                />
              </div>

              <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-muted/30 px-4 py-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Require admin approval for new registrations</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    New signups are held as pending until a super-admin approves them. Existing
                    accounts can still sign in.
                  </p>
                  <p
                    className={cn(
                      "mt-2 inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                      approvalRequired
                        ? "bg-sky-100 text-sky-800"
                        : "bg-green-100 text-green-700",
                    )}
                  >
                    {approvalRequired ? "Approval required" : "Open registration"}
                  </p>
                </div>
                <Switch
                  checked={approvalRequired}
                  disabled={!canWrite}
                  onCheckedChange={(checked) =>
                    setValue("require_registration_approval", checked ? "true" : "false")
                  }
                />
              </div>

              <Field
                label="Feature flags"
                hint='JSON object of flags, e.g. {"beta_analytics": true, "new_onboarding": false}'
              >
                <textarea
                  className={`${inputClass} min-h-32 font-mono text-xs leading-relaxed`}
                  value={settings.feature_flags ?? "{}"}
                  disabled={!canWrite}
                  spellCheck={false}
                  onChange={(e) => {
                    setValue("feature_flags", e.target.value);
                    validateFlags(e.target.value);
                  }}
                  onBlur={(e) => validateFlags(e.target.value)}
                />
                {flagsError ? (
                  <p className="mt-1.5 text-xs text-destructive">{flagsError}</p>
                ) : (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Invalid JSON will block saving. Leave `{}` if unused.
                  </p>
                )}
              </Field>
            </CardContent>
          </Card>

          {canWrite ? (
            <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-xl border border-border bg-background/95 px-4 py-3 shadow-sm backdrop-blur">
              <p className="text-sm text-muted-foreground">
                {dirty ? "You have unsaved changes." : "All changes saved."}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={!dirty || saving}
                  onClick={resetChanges}
                >
                  Discard
                </Button>
                <Button type="submit" disabled={!dirty || saving || Boolean(flagsError)}>
                  {saving ? "Saving…" : "Save settings"}
                </Button>
              </div>
            </div>
          ) : null}
        </form>
      )}
    </div>
  );
}
