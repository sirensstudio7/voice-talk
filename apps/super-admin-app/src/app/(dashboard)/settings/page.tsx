"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { EyeIcon, EyeSlashIcon, PlusIcon, TrashIcon } from "@heroicons/react/24/outline";

import { PageHeader } from "@/components/ui-blocks";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";

const AI_MODELS = [
  "gemini-3.1-flash-live-preview",
  "gemini-2.5-flash-preview-native-audio-dialog",
  "gemini-2.0-flash-live-001",
];

const TTS_MODELS = [
  "gemini-2.5-flash-preview-tts",
  "gemini-3.1-flash-tts-preview",
  "gemini-2.5-pro-preview-tts",
];

const VOICE_PROVIDERS = ["gemini", "elevenlabs", "custom"];

const KEY_PROVIDERS = [
  { id: "elevenlabs", label: "ElevenLabs" },
  { id: "openai", label: "OpenAI" },
  { id: "deepgram", label: "Deepgram" },
  { id: "cartesia", label: "Cartesia" },
  { id: "azure", label: "Azure Speech" },
  { id: "playht", label: "PlayHT" },
  { id: "custom", label: "Custom" },
] as const;

type ProviderKeyRow = {
  id: string;
  provider: string;
  label: string;
  key: string;
  set?: boolean;
};

function parseProviderKeys(raw: string | undefined): ProviderKeyRow[] {
  try {
    const parsed = JSON.parse(raw || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as Record<string, unknown>;
      const id = String(row.id ?? "").trim();
      const provider = String(row.provider ?? "").trim();
      if (!id || !provider) return [];
      return [
        {
          id,
          provider,
          label: String(row.label ?? ""),
          key: String(row.key ?? ""),
          set: row.set === true,
        },
      ];
    });
  } catch {
    return [];
  }
}

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

function providerLabel(provider: string, customLabel: string) {
  if (provider === "custom") return customLabel.trim() || "Custom";
  return KEY_PROVIDERS.find((item) => item.id === provider)?.label ?? provider;
}

function ProviderKeyRowFields({
  row,
  canWrite,
  onChange,
  onRemove,
}: {
  row: ProviderKeyRow;
  canWrite: boolean;
  onChange: (patch: Partial<ProviderKeyRow>) => void;
  onRemove: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const masked = /^•+/.test(row.key);
  const configured = row.set === true || masked;
  return (
    <div className="grid gap-2 rounded-xl border border-border bg-muted/20 p-3 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto]">
      <div className="flex flex-col gap-2">
        <select
          className={selectClass}
          value={KEY_PROVIDERS.some((item) => item.id === row.provider) ? row.provider : "custom"}
          disabled={!canWrite}
          onChange={(e) => onChange({ provider: e.target.value })}
        >
          {KEY_PROVIDERS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        {row.provider === "custom" ? (
          <input
            className={inputClass}
            value={row.label}
            disabled={!canWrite}
            placeholder="Provider name"
            onChange={(e) => onChange({ label: e.target.value })}
          />
        ) : null}
      </div>
      <div className="relative min-w-0">
        <input
          type={visible && !masked ? "text" : "password"}
          autoComplete="off"
          spellCheck={false}
          className={`${inputClass} pr-10 font-mono`}
          value={row.key}
          disabled={!canWrite}
          placeholder={configured ? "Key saved — paste a new one to replace" : "Paste API key"}
          onChange={(e) => onChange({ key: e.target.value })}
        />
        <button
          type="button"
          className="absolute right-0 top-0 flex h-10 w-10 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40"
          disabled={!canWrite || !row.key || masked}
          onClick={() => setVisible((prev) => !prev)}
          aria-label={visible ? "Hide API key" : "Show API key"}
        >
          {visible ? <EyeSlashIcon className="size-4" /> : <EyeIcon className="size-4" />}
        </button>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {configured
            ? `${providerLabel(row.provider, row.label)} key is saved.`
            : "Not saved yet."}
        </p>
      </div>
      {canWrite ? (
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="self-start"
          onClick={onRemove}
          aria-label={`Remove ${providerLabel(row.provider, row.label)} key`}
        >
          <TrashIcon className="size-4" />
        </Button>
      ) : null}
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

  const providerKeys = useMemo(
    () => parseProviderKeys(settings.provider_api_keys),
    [settings.provider_api_keys],
  );

  function setProviderKeys(next: ProviderKeyRow[]) {
    setValue("provider_api_keys", JSON.stringify(next));
  }

  function addProviderKey() {
    const used = new Set(providerKeys.map((row) => row.provider));
    const nextProvider = KEY_PROVIDERS.find((item) => !used.has(item.id))?.id ?? "custom";
    setProviderKeys([
      ...providerKeys,
      {
        id: crypto.randomUUID(),
        provider: nextProvider,
        label: nextProvider === "custom" ? "" : providerLabel(nextProvider, ""),
        key: "",
      },
    ]);
  }

  function updateProviderKey(id: string, patch: Partial<ProviderKeyRow>) {
    setProviderKeys(
      providerKeys.map((row) => {
        if (row.id !== id) return row;
        const next = { ...row, ...patch };
        if (patch.provider && patch.provider !== "custom") {
          next.label = providerLabel(patch.provider, "");
        }
        return next;
      }),
    );
  }

  function removeProviderKey(id: string) {
    setProviderKeys(providerKeys.filter((row) => row.id !== id));
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
      const payload: Record<string, string> = {
        default_ai_model: settings.default_ai_model ?? "",
        default_tts_model: settings.default_tts_model ?? "",
        default_voice_provider: settings.default_voice_provider ?? "",
        storage_quota_mb: settings.storage_quota_mb ?? "1024",
        manual_mrr: settings.manual_mrr ?? "0",
        usd_idr_rate: settings.usd_idr_rate ?? "",
        maintenance_mode: maintenanceOn ? "true" : "false",
        require_registration_approval: approvalRequired ? "true" : "false",
        feature_flags: (settings.feature_flags ?? "{}").trim() || "{}",
        provider_api_keys: JSON.stringify(
          parseProviderKeys(settings.provider_api_keys)
            .filter((row) => row.key.trim() || row.set)
            .map(({ id, provider, label, key }) => ({ id, provider, label, key })),
        ),
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

  const ttsOptions = useMemo(() => {
    const current = settings.default_tts_model;
    if (current && !TTS_MODELS.includes(current)) {
      return [current, ...TTS_MODELS];
    }
    return TTS_MODELS;
  }, [settings.default_tts_model]);

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
                Default live model, TTS, and voice provider applied to new workspaces.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 py-5 sm:grid-cols-2 lg:grid-cols-3">
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
                label="Default TTS model"
                hint="Gemini speech model for LIVE host, presenter, and previews."
              >
                <select
                  className={selectClass}
                  value={settings.default_tts_model || TTS_MODELS[0]}
                  disabled={!canWrite}
                  onChange={(e) => setValue("default_tts_model", e.target.value)}
                >
                  {ttsOptions.map((model) => (
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
            <CardHeader className="flex flex-row items-start justify-between gap-3 border-b border-border py-5">
              <div className="space-y-1.5">
                <CardTitle>Provider API keys</CardTitle>
                <CardDescription>
                  Add a key per speech provider. Gemini still uses the server environment key.
                </CardDescription>
              </div>
              {canWrite ? (
                <Button type="button" variant="outline" size="sm" onClick={addProviderKey}>
                  <PlusIcon className="size-4" />
                  Add API key
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className="py-5">
              {providerKeys.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
                  <p className="text-sm font-medium">No provider keys yet</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Add ElevenLabs, Deepgram, or any other API key you want to use later.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {providerKeys.map((row) => (
                    <ProviderKeyRowFields
                      key={row.id}
                      row={row}
                      canWrite={canWrite}
                      onChange={(patch) => updateProviderKey(row.id, patch)}
                      onRemove={() => removeProviderKey(row.id)}
                    />
                  ))}
                </div>
              )}
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
              <Field
                label="USD to IDR rate"
                hint="Leave empty to use today's live USD/IDR market rate. Fill only to lock a fixed number."
              >
                <input
                  type="number"
                  min={0}
                  step={1}
                  className={inputClass}
                  value={settings.usd_idr_rate ?? ""}
                  disabled={!canWrite}
                  placeholder="Live rate"
                  onChange={(e) => setValue("usd_idr_rate", e.target.value)}
                />
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
