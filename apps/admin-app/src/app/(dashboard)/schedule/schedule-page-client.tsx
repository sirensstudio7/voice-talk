"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

import { PageHeader } from "@/components/ui";
import { api, type BusinessHour } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const inputClassName =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400";

function sortHours(hours: BusinessHour[]) {
  return [...hours].sort((a, b) => a.day_of_week - b.day_of_week);
}

function defaultHours(): BusinessHour[] {
  return DAY_LABELS.map((_, dayOfWeek) => ({
    day_of_week: dayOfWeek,
    open_time: "09:00",
    close_time: "18:00",
    is_closed: dayOfWeek === 0,
  }));
}

export function SchedulePageClient() {
  const { token, business } = useAuth();
  const [hours, setHours] = useState<BusinessHour[]>(defaultHours());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !business) return;

    setLoading(true);
    void api
      .getSchedule(token, business.id)
      .then((data) => {
        setHours(sortHours(data.length > 0 ? data : defaultHours()));
      })
      .catch(() => {
        setHours(defaultHours());
      })
      .finally(() => setLoading(false));
  }, [token, business]);

  const updateHour = (dayOfWeek: number, patch: Partial<BusinessHour>) => {
    setSaved(false);
    setHours((current) =>
      current.map((hour) =>
        hour.day_of_week === dayOfWeek ? { ...hour, ...patch } : hour,
      ),
    );
  };

  const handleSave = async () => {
    if (!token || !business) return;

    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const savedHours = await api.saveSchedule(token, business.id, hours);
      setHours(sortHours(savedHours));
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save schedule.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Schedule"
        subtitle={
          loading
            ? "Loading business hours…"
            : "Set when customers can book appointments. Slots are generated from these hours."
        }
        action={
          <button
            type="button"
            disabled={loading || saving}
            onClick={() => {
              void handleSave();
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save schedule"}
          </button>
        }
      />

      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      ) : null}

      {saved ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Schedule saved.
        </div>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Clock className="h-4 w-4 text-slate-400" />
            Weekly hours
          </div>
        </div>

        {loading ? (
          <div className="space-y-3 p-5">
            {DAY_LABELS.map((label) => (
              <div key={label} className="h-14 animate-pulse rounded-lg bg-slate-100" />
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {sortHours(hours).map((hour) => (
              <li
                key={hour.day_of_week}
                className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-[120px]">
                  <p className="text-sm font-semibold text-slate-900">
                    {DAY_LABELS[hour.day_of_week]}
                  </p>
                </div>

                <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={hour.is_closed}
                    onChange={(event) =>
                      updateHour(hour.day_of_week, { is_closed: event.target.checked })
                    }
                    className="h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                  />
                  Closed
                </label>

                <div className="flex flex-1 flex-wrap items-center gap-3 sm:max-w-md sm:justify-end">
                  <div className="w-32">
                    <label className="mb-1 block text-xs font-medium text-slate-500">Opens</label>
                    <input
                      type="time"
                      value={hour.open_time}
                      disabled={hour.is_closed}
                      onChange={(event) =>
                        updateHour(hour.day_of_week, { open_time: event.target.value })
                      }
                      className={inputClassName}
                    />
                  </div>
                  <div className="w-32">
                    <label className="mb-1 block text-xs font-medium text-slate-500">Closes</label>
                    <input
                      type="time"
                      value={hour.close_time}
                      disabled={hour.is_closed}
                      onChange={(event) =>
                        updateHour(hour.day_of_week, { close_time: event.target.value })
                      }
                      className={inputClassName}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
