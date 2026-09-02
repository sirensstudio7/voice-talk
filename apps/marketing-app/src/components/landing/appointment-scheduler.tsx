"use client";

import { useMemo, useState } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  GlobeAltIcon,
  VideoCameraIcon,
} from "@heroicons/react/24/outline";

import { LorescaleLogo } from "@/components/landing/lorescale-logo";
import { cn } from '@voicetalk/ui';

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const DAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

const DEFAULT_TIME_SLOTS = [
  "09:00",
  "10:00",
  "11:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
];

function toDateKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isWeekday(date: Date) {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

function parseDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

export type AppointmentSchedulerProps = {
  selectedDate: string;
  selectedTime: string;
  onDateSelect: (date: string) => void;
  onTimeSelect: (time: string) => void;
  meetingTitle?: string;
  duration?: string;
  timeSlots?: string[];
};

export function AppointmentScheduler({
  selectedDate,
  selectedTime,
  onDateSelect,
  onTimeSelect,
  meetingTitle = "Lorescale product demo",
  duration = "30 min",
  timeSlots = DEFAULT_TIME_SLOTS,
}: AppointmentSchedulerProps) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const initial = parseDateKey(selectedDate) ?? today;

  const [currentMonth, setCurrentMonth] = useState(initial.getMonth());
  const [currentYear, setCurrentYear] = useState(initial.getFullYear());
  const [timeFormat, setTimeFormat] = useState<"12h" | "24h">("12h");

  const timezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return "Local time";
    }
  }, []);

  const availableDateKeys = useMemo(() => {
    const keys = new Set<string>();
    for (let offset = 0; offset < 90; offset += 1) {
      const date = new Date(today);
      date.setDate(today.getDate() + offset);
      if (isWeekday(date)) {
        keys.add(toDateKey(date.getFullYear(), date.getMonth(), date.getDate()));
      }
    }
    return keys;
  }, [today]);

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDay = new Date(currentYear, currentMonth, 1).getDay();

  const calendarDays: Array<number | null> = [];
  for (let i = 0; i < firstDay; i += 1) calendarDays.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) calendarDays.push(day);

  const canGoPrev =
    currentYear > today.getFullYear() ||
    (currentYear === today.getFullYear() && currentMonth > today.getMonth());

  function handlePrevMonth() {
    if (!canGoPrev) return;
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((year) => year - 1);
    } else {
      setCurrentMonth((month) => month - 1);
    }
  }

  function handleNextMonth() {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((year) => year + 1);
    } else {
      setCurrentMonth((month) => month + 1);
    }
  }

  function handleDateClick(day: number) {
    const key = toDateKey(currentYear, currentMonth, day);
    if (!availableDateKeys.has(key)) return;
    onDateSelect(key);
  }

  const selectedDateObj = parseDateKey(selectedDate);
  const selectedDayLabel = selectedDateObj
    ? selectedDateObj.toLocaleDateString("en-US", { weekday: "short" })
    : "Pick a day";
  const selectedDateLabel = selectedDateObj
    ? selectedDateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "";

  function formatTime(time: string) {
    if (timeFormat === "24h") return time;
    const [hours, minutes] = time.split(":");
    const hour = Number.parseInt(hours, 10);
    const ampm = hour >= 12 ? "PM" : "AM";
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  }

  return (
    <div className="flex w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white lg:flex-row">
      <div className="w-full space-y-6 border-b border-slate-200 bg-white p-5 lg:w-64 lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-50">
            <LorescaleLogo className="h-6 w-auto" />
          </div>
          <span className="text-sm text-slate-500">Lorescale</span>
        </div>

        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-slate-900">{meetingTitle}</h2>
          <div className="space-y-3 text-sm text-slate-500">
            <div className="flex items-center gap-2">
              <VideoCameraIcon className="size-4 shrink-0" />
              <span>Video call walkthrough</span>
            </div>
            <div className="flex items-center gap-2">
              <ClockIcon className="size-4 shrink-0" />
              <span>{duration}</span>
            </div>
            <div className="flex items-center gap-2">
              <GlobeAltIcon className="size-4 shrink-0" />
              <span>{timezone}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 p-4 md:p-5">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-slate-900">
              {MONTH_NAMES[currentMonth]}{" "}
              <span className="text-slate-500">{currentYear}</span>
            </h3>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={handlePrevMonth}
                disabled={!canGoPrev}
                className="inline-flex size-8 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Previous month"
              >
                <ChevronLeftIcon className="size-4" />
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                className="inline-flex size-8 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100"
                aria-label="Next month"
              >
                <ChevronRightIcon className="size-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {DAY_NAMES.map((day) => (
              <div
                key={day}
                className="py-2 text-center text-[11px] font-medium text-slate-400 sm:text-xs"
              >
                {day}
              </div>
            ))}

            {calendarDays.map((day, index) => {
              if (day === null) {
                return <div key={`empty-${index}`} />;
              }

              const key = toDateKey(currentYear, currentMonth, day);
              const isAvailable = availableDateKeys.has(key);
              const isSelected = selectedDate === key;

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleDateClick(day)}
                  disabled={!isAvailable}
                  className={cn(
                    "relative h-10 rounded-lg text-sm font-medium transition sm:h-12",
                    isSelected && "bg-orange-500 text-white shadow-sm",
                    !isSelected &&
                      isAvailable &&
                      "bg-slate-100 text-slate-900 hover:bg-slate-200",
                    !isAvailable && "cursor-not-allowed text-slate-300",
                  )}
                >
                  {day}
                  {isAvailable && !isSelected ? (
                    <span className="absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full bg-slate-500" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex w-full flex-col border-t border-slate-200 bg-white p-5 lg:w-64 lg:border-l lg:border-t-0">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="text-sm">
            <span className="font-medium text-slate-900">{selectedDayLabel}</span>
            {selectedDateLabel ? (
              <span className="text-slate-500">, {selectedDateLabel}</span>
            ) : null}
          </div>
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setTimeFormat("12h")}
              className={cn(
                "rounded px-2 py-1 text-xs font-medium transition",
                timeFormat === "12h"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700",
              )}
            >
              12h
            </button>
            <button
              type="button"
              onClick={() => setTimeFormat("24h")}
              className={cn(
                "rounded px-2 py-1 text-xs font-medium transition",
                timeFormat === "24h"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700",
              )}
            >
              24h
            </button>
          </div>
        </div>

        <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1 lg:max-h-[420px]">
          {!selectedDate ? (
            <p className="py-8 text-center text-sm text-slate-400">
              Select a date to see available times.
            </p>
          ) : (
            timeSlots.map((time) => {
              const isSelected = selectedTime === time;
              return (
                <button
                  key={time}
                  type="button"
                  onClick={() => onTimeSelect(time)}
                  className={cn(
                    "w-full rounded-lg px-4 py-3 text-sm font-medium transition",
                    isSelected
                      ? "bg-orange-500 text-white shadow-sm"
                      : "bg-slate-100 text-slate-900 hover:bg-slate-200",
                  )}
                >
                  {formatTime(time)}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
