"use client";

import { useEffect, useState } from "react";
import { CommandLineIcon } from "@heroicons/react/24/outline";

const QUICK_KEYS = ["Enter", "Space", "F8"] as const;
const BLOCKED_KEYS = new Set([
  "Tab",
  "Escape",
  "Meta",
  "Control",
  "Alt",
  "Shift",
  "Dead",
]);

function normalizeHotkey(key: string): string | null {
  const mapped = key === " " ? "Space" : key.trim();
  if (!mapped || mapped.length > 32 || BLOCKED_KEYS.has(mapped)) return null;
  return mapped;
}

export function formatHotkeyLabel(hotkey: string): string {
  if (hotkey === " " || hotkey.toLowerCase() === "space") return "Space";
  if (hotkey.length === 1) return hotkey.toUpperCase();
  return hotkey;
}

export function StartHotkeyCard({
  cameraTriggerEnabled,
  hotkey,
  saving,
  onChange,
}: {
  cameraTriggerEnabled: boolean;
  hotkey: string;
  saving?: boolean;
  onChange: (hotkey: string) => void;
}) {
  const [listening, setListening] = useState(false);

  useEffect(() => {
    if (!listening) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const next = normalizeHotkey(event.key);
      if (!next) return;
      onChange(next);
      setListening(false);
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [listening, onChange]);

  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white p-5 ${
        cameraTriggerEnabled ? "opacity-60" : ""
      }`}
    >
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-500">
          <CommandLineIcon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">Start button key</p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
            {cameraTriggerEnabled
              ? "Unused while Camera trigger is on. Turn it off in Vision settings to use a hardware button or keyboard."
              : "Used when Camera trigger is off. A hardware kiosk button or keyboard starts Order Now."}
          </p>
        </div>
      </div>

      <button
        type="button"
        aria-pressed={listening}
        disabled={saving}
        onClick={() => setListening((current) => !current)}
        className={`mb-3 flex w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors ${
          listening
            ? "border-orange-300 bg-orange-50 ring-2 ring-orange-500/20"
            : "border-slate-200 bg-slate-50 hover:bg-white"
        }`}
      >
        <span className="text-xs font-medium text-slate-500">
          {listening ? "Press a key…" : "Current key"}
        </span>
        <kbd className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-sm font-semibold text-slate-900 shadow-sm">
          {formatHotkeyLabel(hotkey)}
        </kbd>
      </button>

      <div className="grid grid-cols-3 gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
        {QUICK_KEYS.map((key) => {
          const selected = formatHotkeyLabel(hotkey) === key;
          return (
            <button
              key={key}
              type="button"
              disabled={saving}
              aria-pressed={selected}
              onClick={() => {
                setListening(false);
                onChange(key);
              }}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                selected
                  ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {key}
            </button>
          );
        })}
      </div>
    </section>
  );
}
