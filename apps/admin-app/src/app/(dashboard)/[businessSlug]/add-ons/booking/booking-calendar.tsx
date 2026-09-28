"use client";

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PhoneIcon,
  UserIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { api, type Appointment } from "@/lib/api";
import { cn } from "@/lib/cn";
import {
  formatSelectedDateLabel,
  parseApiDate,
  toDateInputValue,
  todayDateInputValue,
} from "@/lib/dates";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_CHIPS = 3;

const CHIP_TONES = [
  { chip: "bg-sky-100 text-sky-800", bar: "bg-sky-500" },
  { chip: "bg-teal-100 text-teal-800", bar: "bg-teal-500" },
  { chip: "bg-violet-100 text-violet-800", bar: "bg-violet-500" },
  { chip: "bg-amber-100 text-amber-800", bar: "bg-amber-500" },
  { chip: "bg-rose-100 text-rose-800", bar: "bg-rose-500" },
] as const;

function toneFor(key: string) {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return CHIP_TONES[Math.abs(hash) % CHIP_TONES.length];
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function mondayFirstIndex(date: Date) {
  return (date.getDay() + 6) % 7;
}

function monthCells(month: Date) {
  const first = startOfMonth(month);
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - mondayFirstIndex(first));
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    return day;
  });
}

function formatChipTime(iso: string) {
  return parseApiDate(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatTimeRange(startsAt: string, endsAt: string) {
  return `${formatChipTime(startsAt)} – ${formatChipTime(endsAt)}`;
}

export function BookingCalendar({
  token,
  businessId,
}: {
  token: string;
  businessId: string;
}) {
  const todayKey = todayDateInputValue();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAppointments(await api.listAppointments(token, businessId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load bookings.");
    } finally {
      setLoading(false);
    }
  }, [token, businessId]);

  useEffect(() => {
    void load();
  }, [load]);

  const byDate = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const item of appointments) {
      const key = toDateInputValue(parseApiDate(item.starts_at));
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) => parseApiDate(a.starts_at).getTime() - parseApiDate(b.starts_at).getTime(),
      );
    }
    return map;
  }, [appointments]);

  const cells = useMemo(() => monthCells(month), [month]);
  const dayAppointments = byDate.get(selectedDate) ?? [];
  const scheduledForDay = dayAppointments.filter((item) => item.status !== "cancelled");
  const monthLabel = month.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const goToday = () => {
    const now = new Date();
    setMonth(startOfMonth(now));
    setSelectedDate(todayDateInputValue());
  };

  const handleCancel = async (appointment: Appointment) => {
    if (
      !window.confirm(
        `Cancel ${appointment.treatment_name} for ${appointment.customer_name}?`,
      )
    ) {
      return;
    }
    setCancellingId(appointment.id);
    try {
      await api.cancelAppointment(token, businessId, appointment.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel booking.");
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="sm" onClick={goToday}>
            Today
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Previous month"
            onClick={() => setMonth((current) => addMonths(current, -1))}
          >
            <ChevronLeftIcon className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Next month"
            onClick={() => setMonth((current) => addMonths(current, 1))}
          >
            <ChevronRightIcon className="size-4" />
          </Button>
          <h2 className="ml-1 text-xl font-normal tracking-tight text-slate-800">{monthLabel}</h2>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="grid grid-cols-7 border-b border-slate-200">
          {WEEKDAYS.map((label) => (
            <div
              key={label}
              className="px-2 py-2 text-center text-[11px] font-medium uppercase tracking-wide text-slate-500"
            >
              {label}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day) => {
            const key = toDateInputValue(day);
            const inMonth = day.getMonth() === month.getMonth();
            const isToday = key === todayKey;
            const isSelected = key === selectedDate;
            const items = (byDate.get(key) ?? []).filter((item) => item.status !== "cancelled");
            const visible = items.slice(0, MAX_CHIPS);
            const extra = items.length - visible.length;

            return (
              <button
                key={key}
                type="button"
                aria-current={isToday ? "date" : undefined}
                aria-pressed={isSelected}
                onClick={() => setSelectedDate(key)}
                className={cn(
                  "flex min-h-[4.75rem] flex-col border-b border-r border-slate-200 px-1 pb-1 pt-1.5 text-left transition-colors [&:nth-child(7n)]:border-r-0 [&:nth-child(n+36)]:border-b-0 sm:min-h-[5.75rem]",
                  !inMonth && "bg-slate-50/70",
                  isSelected && "bg-orange-50",
                  !isSelected && "hover:bg-slate-50",
                )}
              >
                <span
                  className={cn(
                    "mb-1 inline-flex size-7 items-center justify-center self-center rounded-full text-[13px] leading-none",
                    isToday
                      ? "bg-orange-500 font-semibold text-white"
                      : isSelected
                        ? "bg-slate-900 font-medium text-white"
                        : inMonth
                          ? "font-medium text-slate-800"
                          : "text-slate-400",
                  )}
                >
                  {day.getDate()}
                </span>
                <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
                  {loading ? (
                    <span className="mx-auto mt-2 size-1.5 rounded-full bg-slate-200" />
                  ) : (
                    <>
                      {visible.map((item) => (
                        <span
                          key={item.id}
                          className={cn(
                            "block truncate rounded px-1 py-0.5 text-[10px] font-medium leading-tight sm:text-[11px]",
                            toneFor(item.staff_id || item.treatment_name).chip,
                          )}
                        >
                          <span className="hidden sm:inline">{formatChipTime(item.starts_at)} </span>
                          {item.customer_name}
                        </span>
                      ))}
                      {extra > 0 ? (
                        <span className="px-1 text-[10px] font-medium text-slate-500">
                          +{extra} more
                        </span>
                      ) : null}
                    </>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              {selectedDate === todayKey ? "Today" : formatSelectedDateLabel(selectedDate)}
            </h3>
            <p className="text-xs text-slate-500">
              {loading
                ? "Loading…"
                : scheduledForDay.length === 0
                  ? "No bookings"
                  : `${scheduledForDay.length} ${scheduledForDay.length === 1 ? "booking" : "bookings"}`}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2 p-4">
            <div className="h-12 animate-pulse rounded-lg bg-slate-100" />
            <div className="h-12 animate-pulse rounded-lg bg-slate-100" />
          </div>
        ) : dayAppointments.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-400">Nothing scheduled.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {dayAppointments.map((appointment) => {
              const cancelled = appointment.status === "cancelled";
              return (
                <li
                  key={appointment.id}
                  className={cn("flex gap-3 px-4 py-3", cancelled && "opacity-60")}
                >
                  <p
                    className={cn(
                      "w-[4.75rem] shrink-0 pt-0.5 text-xs font-medium tabular-nums text-slate-500",
                      cancelled && "line-through",
                    )}
                  >
                    {formatChipTime(appointment.starts_at)}
                  </p>
                  <span
                    className={cn(
                      "mt-1 h-8 w-1 shrink-0 rounded-full",
                      cancelled ? "bg-slate-300" : toneFor(appointment.staff_id || appointment.treatment_name).bar,
                    )}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "truncate text-sm font-medium text-slate-900",
                        cancelled && "line-through",
                      )}
                    >
                      {appointment.treatment_name}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-slate-500">
                      <UserIcon className="size-3.5 shrink-0" aria-hidden />
                      {appointment.customer_name}
                      {appointment.staff_name ? ` · ${appointment.staff_name}` : ""}
                    </p>
                    {appointment.customer_phone ? (
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                        <PhoneIcon className="size-3.5 shrink-0" aria-hidden />
                        {appointment.customer_phone}
                      </p>
                    ) : null}
                    <p className="mt-1 text-[11px] text-slate-400">
                      {formatTimeRange(appointment.starts_at, appointment.ends_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span
                      className={cn(
                        "text-[11px] font-medium capitalize",
                        cancelled ? "text-red-600" : "text-emerald-600",
                      )}
                    >
                      {appointment.status}
                    </span>
                    {!cancelled ? (
                      <button
                        type="button"
                        disabled={cancellingId === appointment.id}
                        onClick={() => void handleCancel(appointment)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-60"
                      >
                        <XCircleIcon className="size-3.5" />
                        {cancellingId === appointment.id ? "Cancelling…" : "Cancel"}
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
