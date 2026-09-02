"use client";

import { useEffect, useRef, useState } from "react";
import {
  CalendarDaysIcon,
} from "@heroicons/react/24/outline";

import {
  formatShortDateLabel,
  todayDateInputValue,
  yesterdayDateInputValue,
} from "@/lib/dates";

function pillClass(active: boolean) {
  return [
    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
    active
      ? "bg-slate-900 text-white"
      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
  ].join(" ");
}

export function DateFilter({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dayKeys, setDayKeys] = useState<{ today: string; yesterday: string } | null>(null);

  useEffect(() => {
    setDayKeys({
      today: todayDateInputValue(),
      yesterday: yesterdayDateInputValue(),
    });
  }, []);

  const today = dayKeys?.today ?? null;
  const yesterday = dayKeys?.yesterday ?? null;
  const isCustom =
    value !== null && today !== null && yesterday !== null && value !== today && value !== yesterday;

  const openPicker = () => {
    const input = inputRef.current;
    if (!input) return;
    if (typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }
    input.click();
  };

  return (
    <div
      role="group"
      aria-label="Filter by date"
      className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1"
    >
      <button type="button" onClick={() => onChange(null)} className={pillClass(value === null)}>
        All
      </button>
      <button type="button" onClick={() => onChange(today)} className={pillClass(value === today)}>
        Today
      </button>
      <button
        type="button"
        onClick={() => onChange(yesterday)}
        className={pillClass(value === yesterday)}
      >
        Yesterday
      </button>

      <div className="relative">
        <button
          type="button"
          onClick={openPicker}
          className={pillClass(isCustom)}
          aria-label={isCustom ? `Custom date: ${formatShortDateLabel(value)}` : "Pick a date"}
        >
          <CalendarDaysIcon className="h-4 w-4 shrink-0" aria-hidden />
          {isCustom ? <span>{formatShortDateLabel(value)}</span> : null}
        </button>

        <input
          ref={inputRef}
          id={id}
          type="date"
          tabIndex={-1}
          value={isCustom ? value : ""}
          max={today ?? undefined}
          onChange={(event) => onChange(event.target.value || null)}
          className="absolute bottom-0 left-0 h-px w-px opacity-0"
          aria-hidden
        />
      </div>
    </div>
  );
}
