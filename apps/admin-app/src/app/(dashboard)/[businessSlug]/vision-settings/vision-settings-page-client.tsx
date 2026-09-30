"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowDownOnSquareIcon,
  ArrowPathIcon,
  CameraIcon,
  ChatBubbleOvalLeftIcon,
  ClockIcon,
  ViewfinderCircleIcon,
} from "@heroicons/react/24/outline";

import { PageHeader } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useSidebar } from "@/components/ui/sidebar";
import { api, type VisionMetrics, type VisionSettings } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { customerAppUrl } from "@/lib/customer-app";
import { deferEffectRun } from "@/lib/defer-effect-run";

const DEFAULT_SETTINGS: VisionSettings = {
  camera_trigger_enabled: false,
  start_hotkey: "Enter",
  vision_source: "auto",
  greeting_trigger_mode: "presence",
  greeting_delay_seconds: 3,
  detection_distance_m: 2,
  cooldown_seconds: 30,
  lost_timeout_seconds: 5,
  silence_timeout_seconds: 15,
  auto_goodbye_timeout_seconds: 10,
  greeting_script: "Hello, welcome. How may I assist you today?",
  goodbye_script: "Thank you. Have a wonderful day.",
};

function settingsEqual(a: VisionSettings, b: VisionSettings) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function SettingsField({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div>
        <label className="text-sm font-medium text-slate-900">{label}</label>
        {description ? <p className="mt-0.5 text-xs text-slate-500">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

export function VisionSettingsPageClient() {
  const { token, business } = useAuth();
  const { state: sidebarState, isMobile } = useSidebar();
  const [settings, setSettings] = useState<VisionSettings>(DEFAULT_SETTINGS);
  const [savedSettings, setSavedSettings] = useState<VisionSettings>(DEFAULT_SETTINGS);
  const [metrics, setMetrics] = useState<VisionMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const dirty = useMemo(() => !settingsEqual(settings, savedSettings), [settings, savedSettings]);

  const footerStyle = {
    left: isMobile
      ? "0px"
      : sidebarState === "collapsed"
        ? "var(--sidebar-width-icon)"
        : "var(--sidebar-width)",
  } as const;

  useEffect(() => {
    if (!token || !business) return;

    let cancelled = false;
    deferEffectRun(() => {
      setLoading(true);
      setError(null);
    });

    void Promise.all([
      api.getVisionSettings(token, business.id),
      api.getVisionMetrics(token, business.id),
    ])
      .then(([loaded, loadedMetrics]) => {
        if (cancelled) return;
        setSettings({ ...DEFAULT_SETTINGS, ...loaded });
        setSavedSettings({ ...DEFAULT_SETTINGS, ...loaded });
        setMetrics(loadedMetrics);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load vision settings.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, business]);

  const handleSave = async () => {
    if (!token || !business) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await api.updateVisionSettings(token, business.id, settings);
      setSettings(updated);
      setSavedSettings(updated);
      setSuccess("Vision settings saved.");
      const loadedMetrics = await api.getVisionMetrics(token, business.id);
      setMetrics(loadedMetrics);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save vision settings.");
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    setSettings(savedSettings);
    setError(null);
    setSuccess(null);
  };

  if (!business) return null;

  return (
    <>
      <div className={`max-w-3xl space-y-6 ${dirty ? "pb-24" : "pb-10"}`}>
        <PageHeader
          title="Vision Settings"
          subtitle="Configure camera-based visitor detection and automatic greetings for kiosk mode."
        />

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      ) : null}

      {metrics ? (
        <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Enters (7d)</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{metrics.person_enter_count}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Confirmed greetings</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{metrics.person_confirmed_count}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">False trigger rate</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {(metrics.false_greeting_rate * 100).toFixed(1)}%
            </p>
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-5 flex items-start gap-3">
          <div className="rounded-xl bg-orange-50 p-2 text-orange-600">
            <CameraIcon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Camera trigger</h2>
            <p className="mt-1 text-sm text-slate-600">
              When enabled, the kiosk greets visitors who stop in front of the signage — no button press required.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <label htmlFor="camera-trigger" className="text-sm font-medium text-slate-800">
            Enable camera trigger
          </label>
          <Switch
            id="camera-trigger"
            checked={settings.camera_trigger_enabled}
            disabled={loading}
            onCheckedChange={(checked) =>
              setSettings((current) => ({
                ...current,
                camera_trigger_enabled: checked,
              }))
            }
          />
        </div>
        {!settings.camera_trigger_enabled ? (
          <p className="text-xs leading-relaxed text-slate-500">
            With camera trigger off, customers start with Order Now — or a hardware button / keyboard.
            Set that key on AI Rules.
          </p>
        ) : null}
      </section>

      {settings.camera_trigger_enabled ? (
        <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2 text-slate-900">
            <CameraIcon className="h-5 w-5 text-orange-500" />
            <h2 className="text-base font-semibold">Vision source</h2>
          </div>

          <SettingsField
            label="Camera input"
            description="Choose where visitor detection runs. Auto is recommended for most setups."
          >
            <div className="grid gap-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 has-[:checked]:border-orange-300 has-[:checked]:bg-orange-50">
                <input
                  type="radio"
                  name="vision-source"
                  value="auto"
                  checked={settings.vision_source === "auto"}
                  disabled={loading}
                  onChange={() =>
                    setSettings((current) => ({ ...current, vision_source: "auto" }))
                  }
                  className="mt-1"
                />
                <span>
                  <span className="block text-sm font-medium text-slate-900">
                    Auto (recommended)
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    Uses the browser camera on the kiosk display — nothing to install on site.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 has-[:checked]:border-orange-300 has-[:checked]:bg-orange-50">
                <input
                  type="radio"
                  name="vision-source"
                  value="browser"
                  checked={settings.vision_source === "browser"}
                  disabled={loading}
                  onChange={() =>
                    setSettings((current) => ({ ...current, vision_source: "browser" }))
                  }
                  className="mt-1"
                />
                <span>
                  <span className="block text-sm font-medium text-slate-900">Browser camera only</span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    Phone or tablet demo — no sidecar required.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 has-[:checked]:border-orange-300 has-[:checked]:bg-orange-50">
                <input
                  type="radio"
                  name="vision-source"
                  value="human"
                  checked={settings.vision_source === "human"}
                  disabled={loading}
                  onChange={() =>
                    setSettings((current) => ({ ...current, vision_source: "human" }))
                  }
                  className="mt-1"
                />
                <span>
                  <span className="block text-sm font-medium text-slate-900">Human (browser)</span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    Face &amp; hand-focused browser detection for richer gesture control. Runs in the
                    display tab.
                  </span>
                </span>
              </label>
            </div>
          </SettingsField>
        </section>
      ) : null}

      <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2 text-slate-900">
          <ViewfinderCircleIcon className="h-5 w-5 text-orange-500" />
          <h2 className="text-base font-semibold">Detection</h2>
        </div>

        <SettingsField
          label="Greeting trigger"
          description="How visitors start a conversation when camera trigger is enabled."
        >
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 has-[:checked]:border-orange-300 has-[:checked]:bg-orange-50">
              <input
                type="radio"
                name="greeting-trigger-mode"
                value="raise_hand"
                checked={settings.greeting_trigger_mode === "raise_hand"}
                disabled={loading}
                onChange={() =>
                  setSettings((current) => ({
                    ...current,
                    greeting_trigger_mode: "raise_hand",
                  }))
                }
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-medium text-slate-900">Raise hand</span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  Visitor holds a raised hand briefly to start the greeting.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 has-[:checked]:border-orange-300 has-[:checked]:bg-orange-50">
              <input
                type="radio"
                name="greeting-trigger-mode"
                value="gesture"
                checked={settings.greeting_trigger_mode === "gesture"}
                disabled={loading}
                onChange={() =>
                  setSettings((current) => ({
                    ...current,
                    greeting_trigger_mode: "gesture",
                  }))
                }
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-medium text-slate-900">Wave hand</span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  Visitor raises and waves their hand to start the greeting.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 has-[:checked]:border-orange-300 has-[:checked]:bg-orange-50">
              <input
                type="radio"
                name="greeting-trigger-mode"
                value="presence"
                checked={settings.greeting_trigger_mode === "presence"}
                disabled={loading}
                onChange={() =>
                  setSettings((current) => ({
                    ...current,
                    greeting_trigger_mode: "presence",
                  }))
                }
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-medium text-slate-900">Stand in front</span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  Visitor stays in the interaction zone for the greeting delay.
                </span>
              </span>
            </label>
          </div>
        </SettingsField>

        <div className="grid gap-5 sm:grid-cols-2">
          {settings.greeting_trigger_mode === "presence" ? (
            <SettingsField
              label="Greeting delay (seconds)"
              description="How long a visitor must remain in the interaction zone before greeting."
            >
              <input
                type="number"
                min={1}
                max={30}
                value={settings.greeting_delay_seconds}
                disabled={loading}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    greeting_delay_seconds: Number(event.target.value),
                  }))
                }
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </SettingsField>
          ) : null}

          <SettingsField
            label="Detection distance (meters)"
            description="Approximate stand-off distance for visitors in the interaction zone."
          >
            <input
              type="number"
              min={1}
              max={2.5}
              step={0.1}
              value={settings.detection_distance_m}
              disabled={loading}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  detection_distance_m: Number(event.target.value),
                }))
              }
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </SettingsField>
        </div>
      </section>

      <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2 text-slate-900">
          <ClockIcon className="h-5 w-5 text-orange-500" />
          <h2 className="text-base font-semibold">Timeouts</h2>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <SettingsField label="Cooldown (seconds)" description="Wait before greeting the same visitor again.">
            <input
              type="number"
              min={0}
              max={300}
              value={settings.cooldown_seconds}
              disabled={loading}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  cooldown_seconds: Number(event.target.value),
                }))
              }
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </SettingsField>

          <SettingsField label="Lost timeout (seconds)" description="End session if visitor leaves during conversation.">
            <input
              type="number"
              min={1}
              max={60}
              value={settings.lost_timeout_seconds}
              disabled={loading}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  lost_timeout_seconds: Number(event.target.value),
                }))
              }
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </SettingsField>

          <SettingsField label="Silence timeout (seconds)" description="Ask if visitor needs more help after silence.">
            <input
              type="number"
              min={5}
              max={120}
              value={settings.silence_timeout_seconds}
              disabled={loading}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  silence_timeout_seconds: Number(event.target.value),
                }))
              }
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </SettingsField>

          <SettingsField
            label="Auto goodbye timeout (seconds)"
            description="End session if silence continues after the follow-up prompt."
          >
            <input
              type="number"
              min={5}
              max={120}
              value={settings.auto_goodbye_timeout_seconds}
              disabled={loading}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  auto_goodbye_timeout_seconds: Number(event.target.value),
                }))
              }
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </SettingsField>
        </div>
      </section>

      <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2 text-slate-900">
          <ChatBubbleOvalLeftIcon className="h-5 w-5 text-orange-500" />
          <h2 className="text-base font-semibold">Scripts</h2>
        </div>

        <SettingsField label="Greeting script">
          <textarea
            value={settings.greeting_script}
            disabled={loading}
            onChange={(event) =>
              setSettings((current) => ({ ...current, greeting_script: event.target.value }))
            }
            rows={3}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        </SettingsField>

        <SettingsField label="Goodbye script">
          <textarea
            value={settings.goodbye_script}
            disabled={loading}
            onChange={(event) =>
              setSettings((current) => ({ ...current, goodbye_script: event.target.value }))
            }
            rows={3}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        </SettingsField>
      </section>

      <section className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
        <p className="font-medium text-slate-800">Kiosk setup</p>
        <p className="mt-2">
          Open this display URL on the kiosk tablet or mini PC and unlock it with its PIN. Detection
          runs in the browser — allow camera access when prompted.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-900 p-4 text-xs text-slate-100">
          {`${customerAppUrl}/${business.slug}?kiosk=default`}
        </pre>
      </section>
      </div>

      {dirty && !loading ? (
        <footer
          style={footerStyle}
          className="fixed bottom-0 right-0 z-20 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
        >
          <div className="flex w-full items-center justify-between gap-3 px-4 py-3 lg:px-6">
            <Button type="button" variant="outline" onClick={handleDiscard}>
              <ArrowPathIcon />
              Discard
            </Button>
            <Button type="button" disabled={saving} onClick={() => void handleSave()}>
              <ArrowDownOnSquareIcon />
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </footer>
      ) : null}
    </>
  );
}
