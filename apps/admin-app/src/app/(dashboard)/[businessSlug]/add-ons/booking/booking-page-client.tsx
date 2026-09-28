"use client";

import {
  BookOpenIcon,
  CalendarDaysIcon,
  CameraIcon,
  CheckCircleIcon,
  ClockIcon,
  Cog6ToothIcon,
  PencilIcon,
  PlusIcon,
  TableCellsIcon,
  TrashIcon,
  UserIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { AddonConfigPending } from "@/components/addon-config-pending";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useSidebar } from "@/components/ui/sidebar";
import { adminPath } from "@/lib/admin-path";
import {
  api,
  type BookingService,
  type BookingStaff,
  type BusinessHour,
} from "@/lib/api";
import { cn } from "@/lib/cn";
import { useAddonStatus } from "@/lib/use-addon-status";

import { BookingBookingsTable } from "./booking-bookings-table";
import { BookingCalendar } from "./booking-calendar";
import { BookingKnowledge } from "./booking-knowledge";

type ManageTab = "setup" | "calendar" | "bookings" | "knowledge";

const MANAGE_TABS: Array<{
  id: ManageTab;
  label: string;
  icon: typeof CalendarDaysIcon;
}> = [
  { id: "setup", label: "Setup", icon: Cog6ToothIcon },
  { id: "calendar", label: "Calendar", icon: CalendarDaysIcon },
  { id: "bookings", label: "Bookings", icon: TableCellsIcon },
  { id: "knowledge", label: "Knowledge", icon: BookOpenIcon },
];

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const AVATAR_TONES = [
  "bg-teal-100 text-teal-800",
  "bg-orange-100 text-orange-800",
  "bg-sky-100 text-sky-800",
  "bg-violet-100 text-violet-800",
];
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const FEATURES = [
  {
    icon: UserIcon,
    title: "Doctors and staff",
    body: "Add each doctor or specialist. Visitors can ask for them by name on the kiosk.",
  },
  {
    icon: ClockIcon,
    title: "Per-person hours",
    body: "Set weekly hours for each doctor. Slots only open when that person is working.",
  },
  {
    icon: CalendarDaysIcon,
    title: "Voice booking",
    body: "The assistant lists services, checks free times, and books name plus phone.",
  },
  {
    icon: BookOpenIcon,
    title: "Receptionist knowledge",
    body: "Teach parking, insurance, what to bring, and clinic rules so the assistant can answer them.",
  },
] as const;

const inputClassName =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-orange-500";

function BookingEnabledToggle({
  enabled,
  busy,
  onChange,
}: {
  enabled: boolean;
  busy: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="min-w-0">
        <label htmlFor="booking-enabled" className="text-sm font-medium text-slate-800">
          Active on kiosk
        </label>
        <p className="mt-0.5 text-xs text-slate-500">
          {enabled
            ? "Visitors can book by voice. Turn off to pause without cancelling the subscription."
            : "Paused. Doctors and services stay here; the kiosk will not offer booking."}
        </p>
      </div>
      <Switch
        id="booking-enabled"
        checked={enabled}
        disabled={busy}
        onCheckedChange={onChange}
      />
    </div>
  );
}

function defaultHours(): BusinessHour[] {
  return DAY_LABELS.map((_, dayOfWeek) => ({
    day_of_week: dayOfWeek,
    open_time: "09:00",
    close_time: "18:00",
    is_closed: dayOfWeek === 0,
  }));
}

function toTimeValue(value: string) {
  return value.slice(0, 5) || "09:00";
}

function resolveMediaUrl(path: string) {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${API_URL}${path}`;
}

function doctorInitials(name: string) {
  const parts = name
    .replace(/^dr\.?\s*/i, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return parts
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

function DoctorAvatar({
  name,
  photoUrl,
  size = "md",
}: {
  name: string;
  photoUrl?: string;
  size?: "md" | "lg";
}) {
  const src = resolveMediaUrl(photoUrl ?? "");
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setBroken(false);
  }, [src]);
  const dim = size === "lg" ? "size-24" : "size-[4.5rem]";
  if (src && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        className={`${dim} shrink-0 rounded-2xl object-cover ring-1 ring-black/5`}
        onError={() => setBroken(true)}
      />
    );
  }
  const tone = AVATAR_TONES[Math.abs(name.length) % AVATAR_TONES.length];
  return (
    <div
      className={cn(
        dim,
        tone,
        "flex shrink-0 items-center justify-center rounded-2xl font-semibold",
        size === "lg" ? "text-2xl" : "text-lg",
      )}
    >
      {doctorInitials(name) || "DR"}
    </div>
  );
}

function formatHoursSummary(hours: BusinessHour[]) {
  const groups = new Map<string, number[]>();
  for (const day of DAY_ORDER) {
    const row = hours.find((item) => item.day_of_week === day);
    if (!row || row.is_closed) continue;
    const key = `${toTimeValue(row.open_time)}–${toTimeValue(row.close_time)}`;
    const current = groups.get(key) ?? [];
    current.push(day);
    groups.set(key, current);
  }
  if (groups.size === 0) return "No available days";
  return [...groups.entries()]
    .map(([times, days]) => `${formatDaySpan(days)} ${times}`)
    .join(" · ");
}

function formatDaySpan(days: number[]) {
  if (days.length === 1) return DAY_LABELS[days[0]!]!.slice(0, 3);
  const indexes = days.map((day) => DAY_ORDER.indexOf(day));
  const consecutive = indexes.every((value, index) => index === 0 || value === indexes[index - 1]! + 1);
  if (consecutive) {
    return `${DAY_LABELS[days[0]!]!.slice(0, 3)}–${DAY_LABELS[days[days.length - 1]!]!.slice(0, 3)}`;
  }
  return days.map((day) => DAY_LABELS[day]!.slice(0, 3)).join(", ");
}

function WeekPills({ hours }: { hours: BusinessHour[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {DAY_ORDER.map((day) => {
        const row = hours.find((item) => item.day_of_week === day);
        const open = Boolean(row && !row.is_closed);
        const title = open
          ? `${DAY_LABELS[day]} ${toTimeValue(row!.open_time)}–${toTimeValue(row!.close_time)}`
          : `${DAY_LABELS[day]} closed`;
        return (
          <span
            key={day}
            title={title}
            className={cn(
              "flex h-5 min-w-5 items-center justify-center rounded-full px-0.5 text-[9px] font-semibold",
              open
                ? "bg-orange-50 text-orange-700 ring-1 ring-orange-200"
                : "bg-slate-50 text-slate-300",
            )}
          >
            {DAY_SHORT[day]}
          </span>
        );
      })}
    </div>
  );
}

function DoctorStaffCard({
  person,
  hours,
  onEdit,
  onDelete,
  onToggleActive,
}: {
  person: BookingStaff;
  hours: BusinessHour[];
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: (active: boolean) => void;
}) {
  const src = resolveMediaUrl(person.photo_url ?? "");
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setBroken(false);
  }, [src]);
  const tone = AVATAR_TONES[Math.abs(person.name.length) % AVATAR_TONES.length];
  const showPhoto = Boolean(src) && !broken;

  return (
    <article
      className={cn(
        "group flex h-full flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200/80 transition hover:shadow-[0_12px_32px_-12px_rgba(15,23,42,0.18)]",
        person.is_active ? "" : "opacity-75",
      )}
    >
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit ${person.name}`}
        className="relative block aspect-[4/3] w-full overflow-hidden bg-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-inset"
      >
        {showPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt=""
            className="h-full w-full object-cover object-top transition duration-300 group-hover:scale-[1.03]"
            onError={() => setBroken(true)}
          />
        ) : (
          <div
            className={cn(
              "flex h-full w-full items-center justify-center text-4xl font-semibold",
              tone,
            )}
          >
            {doctorInitials(person.name) || "DR"}
          </div>
        )}
        <span
          className={cn(
            "absolute top-2 left-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase shadow-sm ring-1 backdrop-blur",
            person.is_active
              ? "bg-white/95 text-emerald-700 ring-black/5"
              : "bg-white/95 text-slate-500 ring-black/5",
          )}
        >
          {person.is_active ? "Active" : "Hidden"}
        </span>
      </button>

      <div className="flex flex-1 flex-col gap-2 p-2.5">
        <button type="button" onClick={onEdit} className="text-left">
          <p className="truncate text-sm font-semibold leading-tight text-slate-900">
            {person.name}
          </p>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {person.specialty || "No specialty"}
          </p>
          <div className="mt-2">
            <WeekPills hours={hours} />
          </div>
          <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-500">
            {formatHoursSummary(hours)}
          </p>
        </button>

        <div className="mt-auto flex items-center justify-between gap-1 pt-0.5">
          <Switch
            checked={person.is_active}
            onCheckedChange={onToggleActive}
            aria-label={person.is_active ? `Hide ${person.name}` : `Show ${person.name}`}
          />
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={onEdit}
              aria-label={`Edit ${person.name}`}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 active:scale-95"
            >
              <PencilIcon className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              aria-label={`Remove ${person.name}`}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 active:scale-95"
            >
              <TrashIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function HoursFields({
  hours,
  disabled,
  onChange,
}: {
  hours: BusinessHour[];
  disabled?: boolean;
  onChange: (hours: BusinessHour[]) => void;
}) {
  const update = (dayOfWeek: number, patch: Partial<BusinessHour>) => {
    onChange(
      hours.map((row) => (row.day_of_week === dayOfWeek ? { ...row, ...patch } : row)),
    );
  };

  const openDays = DAY_ORDER.filter((dayOfWeek) => {
    const hour =
      hours.find((row) => row.day_of_week === dayOfWeek) ?? defaultHours()[dayOfWeek]!;
    return !hour.is_closed;
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Working days">
        {DAY_ORDER.map((dayOfWeek) => {
          const hour =
            hours.find((row) => row.day_of_week === dayOfWeek) ?? defaultHours()[dayOfWeek]!;
          const open = !hour.is_closed;
          return (
            <button
              key={dayOfWeek}
              type="button"
              aria-pressed={open}
              disabled={disabled}
              onClick={() => update(dayOfWeek, { is_closed: open })}
              className={cn(
                "min-w-[2.6rem] rounded-full px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50",
                open
                  ? "bg-orange-500 text-white shadow-sm"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200",
              )}
            >
              {DAY_SHORT[dayOfWeek]}
            </button>
          );
        })}
      </div>
      {openDays.length === 0 ? (
        <p className="rounded-xl bg-slate-50 px-3 py-3 text-xs text-slate-500">
          Select at least one day they work.
        </p>
      ) : (
        <div className="space-y-1.5">
          {openDays.map((dayOfWeek) => {
            const hour =
              hours.find((row) => row.day_of_week === dayOfWeek) ?? defaultHours()[dayOfWeek]!;
            return (
              <div
                key={dayOfWeek}
                className="flex items-center justify-between gap-3 rounded-xl bg-white py-2 pr-2 pl-3 ring-1 ring-slate-200"
              >
                <span className="min-w-[5.5rem] text-sm font-medium text-slate-800">
                  {DAY_LABELS[dayOfWeek]}
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    aria-label={`${DAY_LABELS[dayOfWeek]} start`}
                    disabled={disabled}
                    value={toTimeValue(hour.open_time)}
                    onChange={(event) => update(dayOfWeek, { open_time: event.target.value })}
                    className={`${inputClassName} w-[7.25rem]`}
                  />
                  <span className="text-xs text-slate-400">to</span>
                  <input
                    type="time"
                    aria-label={`${DAY_LABELS[dayOfWeek]} end`}
                    disabled={disabled}
                    value={toTimeValue(hour.close_time)}
                    onChange={(event) => update(dayOfWeek, { close_time: event.target.value })}
                    className={`${inputClassName} w-[7.25rem]`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DoctorFormModal({
  open,
  editing,
  name,
  specialty,
  photoUrl,
  hours,
  hoursLoading,
  saving,
  uploadingPhoto,
  error,
  onClose,
  onChangeName,
  onChangeSpecialty,
  onChangeHours,
  onUploadPhoto,
  onClearPhoto,
  onSubmit,
}: {
  open: boolean;
  editing: boolean;
  name: string;
  specialty: string;
  photoUrl: string;
  hours: BusinessHour[];
  hoursLoading: boolean;
  saving: boolean;
  uploadingPhoto: boolean;
  error: string | null;
  onClose: () => void;
  onChangeName: (value: string) => void;
  onChangeSpecialty: (value: string) => void;
  onChangeHours: (hours: BusinessHour[]) => void;
  onUploadPhoto: (file: File) => void;
  onClearPhoto: () => void;
  onSubmit: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, saving, onClose]);

  if (!open) return null;

  const canSave = name.trim().length > 0 && hours.some((row) => !row.is_closed);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={() => {
          if (!saving) onClose();
        }}
        aria-label="Close dialog"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="doctor-form-title"
        className="relative z-10 flex max-h-[min(90vh,760px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-slate-200"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="doctor-form-title" className="text-base font-semibold text-slate-900">
              {editing ? "Edit doctor" : "Add doctor"}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Set who visitors can book and the days and times they are available.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            disabled={saving}
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
          >
            <XMarkIcon className="size-4" />
          </button>
        </div>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSave && !saving && !hoursLoading && !uploadingPhoto) onSubmit();
          }}
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <div className="flex items-center gap-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                disabled={saving || uploadingPhoto}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) onUploadPhoto(file);
                  event.target.value = "";
                }}
              />
              <button
                type="button"
                disabled={saving || uploadingPhoto}
                onClick={() => fileInputRef.current?.click()}
                className="relative shrink-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                aria-label="Upload doctor photo"
              >
                <DoctorAvatar name={name || "Doctor"} photoUrl={photoUrl} size="lg" />
                <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-slate-900/40 text-white opacity-0 transition hover:opacity-100">
                  <CameraIcon className="size-6" />
                </span>
              </button>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800">Photo</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {uploadingPhoto ? "Uploading…" : "Shown on the kiosk when visitors pick a doctor."}
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={saving || uploadingPhoto}
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {photoUrl ? "Replace" : "Upload"}
                  </button>
                  {photoUrl ? (
                    <button
                      type="button"
                      disabled={saving || uploadingPhoto}
                      onClick={onClearPhoto}
                      className="rounded-lg px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
            <div>
              <label htmlFor="doctor-name" className="block text-sm font-medium text-slate-700">
                Name
              </label>
              <input
                id="doctor-name"
                autoFocus
                className={`${inputClassName} mt-1.5`}
                placeholder="Dr. Sari Wijaya"
                value={name}
                disabled={saving}
                onChange={(event) => onChangeName(event.target.value)}
              />
            </div>
            <div>
              <label htmlFor="doctor-specialty" className="block text-sm font-medium text-slate-700">
                Specialty
              </label>
              <input
                id="doctor-specialty"
                className={`${inputClassName} mt-1.5`}
                placeholder="General practitioner (optional)"
                value={specialty}
                disabled={saving}
                onChange={(event) => onChangeSpecialty(event.target.value)}
              />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-700">Available days and times</p>
              <p className="mt-0.5 mb-2 text-xs text-slate-500">
                Tap the days they work, then set hours for each.
              </p>
              {hoursLoading ? (
                <p className="text-sm text-slate-500">Loading hours…</p>
              ) : (
                <HoursFields hours={hours} disabled={saving} onChange={onChangeHours} />
              )}
            </div>
            {error ? (
              <p className="text-sm text-red-600" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 px-5 py-4">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              disabled={saving}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="rounded-xl"
              disabled={saving || hoursLoading || uploadingPhoto || !canSave}
            >
              {saving ? "Saving…" : editing ? "Save doctor" : "Add doctor"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ServiceFormModal({
  open,
  editing,
  name,
  duration,
  price,
  saving,
  error,
  onClose,
  onChangeName,
  onChangeDuration,
  onChangePrice,
  onSubmit,
}: {
  open: boolean;
  editing: boolean;
  name: string;
  duration: string;
  price: string;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onChangeName: (value: string) => void;
  onChangeDuration: (value: string) => void;
  onChangePrice: (value: string) => void;
  onSubmit: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, saving, onClose]);

  if (!open) return null;

  const durationNum = Number(duration);
  const canSave = name.trim().length > 0 && Number.isFinite(durationNum) && durationNum >= 5;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={() => {
          if (!saving) onClose();
        }}
        aria-label="Close dialog"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="service-form-title"
        className="relative z-10 flex w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-slate-200"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="service-form-title" className="text-base font-semibold text-slate-900">
              {editing ? "Edit service" : "Add service"}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Duration is used to generate bookable slots on the kiosk.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            disabled={saving}
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
          >
            <XMarkIcon className="size-4" />
          </button>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (canSave && !saving) onSubmit();
          }}
        >
          <div className="space-y-4 px-5 py-4">
            <div>
              <label htmlFor="service-name" className="block text-sm font-medium text-slate-700">
                Service name
              </label>
              <input
                id="service-name"
                autoFocus
                className={`${inputClassName} mt-1.5`}
                placeholder="General consult"
                value={name}
                disabled={saving}
                onChange={(event) => onChangeName(event.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="service-duration" className="block text-sm font-medium text-slate-700">
                  Duration (min)
                </label>
                <input
                  id="service-duration"
                  className={`${inputClassName} mt-1.5`}
                  type="number"
                  min={5}
                  step={5}
                  placeholder="30"
                  value={duration}
                  disabled={saving}
                  onChange={(event) => onChangeDuration(event.target.value)}
                />
              </div>
              <div>
                <label htmlFor="service-price" className="block text-sm font-medium text-slate-700">
                  Price (Rp)
                </label>
                <input
                  id="service-price"
                  className={`${inputClassName} mt-1.5`}
                  type="number"
                  min={0}
                  step={1000}
                  placeholder="0"
                  value={price}
                  disabled={saving}
                  onChange={(event) => onChangePrice(event.target.value)}
                />
              </div>
            </div>
            {error ? (
              <p className="text-sm text-red-600" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 px-5 py-4">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              disabled={saving}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button type="submit" className="rounded-xl" disabled={saving || !canSave}>
              {saving ? "Saving…" : editing ? "Save service" : "Add service"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ManageBooking({
  token,
  businessId,
}: {
  token: string;
  businessId: string;
}) {
  const [staff, setStaff] = useState<BookingStaff[]>([]);
  const [staffHours, setStaffHours] = useState<Record<string, BusinessHour[]>>({});
  const [services, setServices] = useState<BookingService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<BookingStaff | null>(null);
  const [formName, setFormName] = useState("");
  const [formSpecialty, setFormSpecialty] = useState("");
  const [formHours, setFormHours] = useState<BusinessHour[]>(defaultHours());
  const [formPhotoUrl, setFormPhotoUrl] = useState("");
  const [hoursLoading, setHoursLoading] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalSaving, setModalSaving] = useState(false);
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<BookingService | null>(null);
  const [serviceName, setServiceName] = useState("");
  const [serviceDuration, setServiceDuration] = useState("30");
  const [servicePrice, setServicePrice] = useState("0");
  const [serviceModalError, setServiceModalError] = useState<string | null>(null);
  const [serviceModalSaving, setServiceModalSaving] = useState(false);

  const load = useCallback(async (showPending = false) => {
    if (showPending) setLoading(true);
    setError(null);
    try {
      const [nextStaff, nextServices] = await Promise.all([
        api.listBookingStaff(token, businessId),
        api.listBookingServices(token, businessId),
      ]);
      const hourEntries = await Promise.all(
        nextStaff.map(async (person) => {
          try {
            const hours = await api.getBookingStaffHours(token, businessId, person.id);
            return [person.id, hours.length > 0 ? hours : defaultHours()] as const;
          } catch {
            return [person.id, defaultHours()] as const;
          }
        }),
      );
      setStaffHours(Object.fromEntries(hourEntries));
      setStaff(nextStaff);
      setServices(nextServices);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load booking setup.");
    } finally {
      setLoading(false);
    }
  }, [token, businessId]);

  useEffect(() => {
    void load(true);
  }, [load]);

  const closeDoctorModal = useCallback(() => {
    if (modalSaving) return;
    setModalOpen(false);
    setEditingStaff(null);
    setModalError(null);
    setHoursLoading(false);
  }, [modalSaving]);

  const openAddDoctor = () => {
    setEditingStaff(null);
    setFormName("");
    setFormSpecialty("");
    setFormPhotoUrl("");
    setFormHours(defaultHours());
    setModalError(null);
    setHoursLoading(false);
    setModalOpen(true);
  };

  const openEditDoctor = (person: BookingStaff) => {
    setEditingStaff(person);
    setFormName(person.name);
    setFormSpecialty(person.specialty);
    setFormPhotoUrl(person.photo_url ?? "");
    setFormHours(staffHours[person.id] ?? defaultHours());
    setModalError(null);
    setModalOpen(true);
    setHoursLoading(true);
    void api
      .getBookingStaffHours(token, businessId, person.id)
      .then((data) => setFormHours(data.length > 0 ? data : defaultHours()))
      .catch(() => setFormHours(staffHours[person.id] ?? defaultHours()))
      .finally(() => setHoursLoading(false));
  };

  const uploadDoctorPhoto = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      setModalError("Image must be 5 MB or smaller.");
      return;
    }
    setUploadingPhoto(true);
    setModalError(null);
    try {
      const uploaded = await api.uploadProductImage(token, businessId, file);
      setFormPhotoUrl(uploaded.image_url);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : "Could not upload photo.");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const saveDoctor = async () => {
    if (!formName.trim() || !formHours.some((row) => !row.is_closed)) return;
    setModalSaving(true);
    setModalError(null);
    try {
      if (editingStaff) {
        await api.updateBookingStaff(token, businessId, editingStaff.id, {
          name: formName.trim(),
          specialty: formSpecialty.trim(),
          photo_url: formPhotoUrl.trim(),
        });
        await api.saveBookingStaffHours(token, businessId, editingStaff.id, formHours);
      } else {
        await api.createBookingStaff(token, businessId, {
          name: formName.trim(),
          specialty: formSpecialty.trim() || undefined,
          photo_url: formPhotoUrl.trim() || undefined,
          hours: formHours,
        });
      }
      setModalOpen(false);
      setEditingStaff(null);
      await load();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : "Could not save doctor.");
    } finally {
      setModalSaving(false);
    }
  };

  const closeServiceModal = useCallback(() => {
    if (serviceModalSaving) return;
    setServiceModalOpen(false);
    setEditingService(null);
    setServiceModalError(null);
  }, [serviceModalSaving]);

  const openAddService = () => {
    setEditingService(null);
    setServiceName("");
    setServiceDuration("30");
    setServicePrice("0");
    setServiceModalError(null);
    setServiceModalOpen(true);
  };

  const openEditService = (service: BookingService) => {
    setEditingService(service);
    setServiceName(service.name);
    setServiceDuration(String(service.duration_min));
    setServicePrice(String(service.price));
    setServiceModalError(null);
    setServiceModalOpen(true);
  };

  const saveService = async () => {
    const durationMin = Number(serviceDuration);
    if (!serviceName.trim() || !Number.isFinite(durationMin) || durationMin < 5) return;
    setServiceModalSaving(true);
    setServiceModalError(null);
    try {
      const body = {
        name: serviceName.trim(),
        duration_min: durationMin,
        price: Number(servicePrice) || 0,
      };
      if (editingService) {
        await api.updateBookingService(token, businessId, editingService.id, body);
      } else {
        await api.createBookingService(token, businessId, body);
      }
      setServiceModalOpen(false);
      setEditingService(null);
      await load();
    } catch (err) {
      setServiceModalError(err instanceof Error ? err.message : "Could not save service.");
    } finally {
      setServiceModalSaving(false);
    }
  };

  if (loading) return <AddonConfigPending />;

  return (
    <div className="space-y-8">
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      ) : null}

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Doctors</h2>
            <p className="text-sm text-slate-500">
              People visitors can book. Set days and times for each doctor so slots match their
              schedule.
            </p>
          </div>
          <Button type="button" className="shrink-0" onClick={openAddDoctor}>
            <PlusIcon className="size-4" />
            Add
          </Button>
        </div>
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {staff.length === 0 ? (
            <li className="col-span-full rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
              No doctors yet. Add one to start taking voice bookings.
            </li>
          ) : (
            staff.map((person) => (
              <li key={person.id} className="min-w-0">
                <DoctorStaffCard
                  person={person}
                  hours={staffHours[person.id] ?? defaultHours()}
                  onEdit={() => openEditDoctor(person)}
                  onDelete={() => {
                    if (!window.confirm(`Remove ${person.name}?`)) return;
                    void api.deleteBookingStaff(token, businessId, person.id).then(() => load());
                  }}
                  onToggleActive={(checked) => {
                    void api
                      .updateBookingStaff(token, businessId, person.id, {
                        is_active: checked,
                      })
                      .then(() => load());
                  }}
                />
              </li>
            ))
          )}
        </ul>
      </section>

      <DoctorFormModal
        open={modalOpen}
        editing={Boolean(editingStaff)}
        name={formName}
        specialty={formSpecialty}
        photoUrl={formPhotoUrl}
        hours={formHours}
        hoursLoading={hoursLoading}
        saving={modalSaving}
        uploadingPhoto={uploadingPhoto}
        error={modalError}
        onClose={closeDoctorModal}
        onChangeName={setFormName}
        onChangeSpecialty={setFormSpecialty}
        onChangeHours={setFormHours}
        onUploadPhoto={(file) => void uploadDoctorPhoto(file)}
        onClearPhoto={() => setFormPhotoUrl("")}
        onSubmit={() => void saveDoctor()}
      />

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Services</h2>
            <p className="text-sm text-slate-500">
              Consult types the assistant can book (duration is used for slots).
            </p>
          </div>
          <Button type="button" className="shrink-0" onClick={openAddService}>
            <PlusIcon className="size-4" />
            Add
          </Button>
        </div>
        <ul className="space-y-2">
          {services.length === 0 ? (
            <li className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
              Add at least one service, for example “General consult”.
            </li>
          ) : (
            services.map((service) => (
              <li
                key={service.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
              >
                <button type="button" className="min-w-0 text-left" onClick={() => openEditService(service)}>
                  <p className="font-medium text-slate-900">{service.name}</p>
                  <p className="text-xs text-slate-500">
                    {service.duration_min} min
                    {service.price > 0
                      ? ` · Rp ${service.price.toLocaleString("id-ID")}`
                      : ""}
                    {service.is_active ? "" : " · hidden"}
                  </p>
                </button>
                <div className="flex shrink-0 items-center gap-2">
                  <Switch
                    checked={service.is_active}
                    onCheckedChange={(checked) => {
                      void api
                        .updateBookingService(token, businessId, service.id, {
                          is_active: checked,
                        })
                        .then(() => load());
                    }}
                  />
                  <button
                    type="button"
                    className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-700"
                    aria-label={`Edit ${service.name}`}
                    onClick={() => openEditService(service)}
                  >
                    <PencilIcon className="size-4" />
                  </button>
                  <button
                    type="button"
                    className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    aria-label={`Remove ${service.name}`}
                    onClick={() => {
                      if (!window.confirm(`Remove ${service.name}?`)) return;
                      void api
                        .deleteBookingService(token, businessId, service.id)
                        .then(() => load());
                    }}
                  >
                    <TrashIcon className="size-4" />
                  </button>
                </div>
              </li>
            ))
          )}
        </ul>
      </section>

      <ServiceFormModal
        open={serviceModalOpen}
        editing={Boolean(editingService)}
        name={serviceName}
        duration={serviceDuration}
        price={servicePrice}
        saving={serviceModalSaving}
        error={serviceModalError}
        onClose={closeServiceModal}
        onChangeName={setServiceName}
        onChangeDuration={setServiceDuration}
        onChangePrice={setServicePrice}
        onSubmit={() => void saveService()}
      />
    </div>
  );
}

export function BookingPageClient() {
  const { token, business, status, loading, error, isActive, isPending } =
    useAddonStatus("booking");
  const { state: sidebarState, isMobile } = useSidebar();
  const slug = business?.slug ?? "";
  const [kioskEnabled, setKioskEnabled] = useState(true);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsReady, setSettingsReady] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [manageTab, setManageTab] = useState<ManageTab>("setup");

  useEffect(() => {
    if (!token || !business?.id || !isActive) {
      setSettingsReady(false);
      return;
    }
    let cancelled = false;
    void api
      .getBookingSettings(token, business.id)
      .then((settings) => {
        if (cancelled) return;
        setKioskEnabled(settings.enabled);
        setSettingsReady(true);
      })
      .catch((err) => {
        if (cancelled) return;
        setKioskEnabled(true);
        setSettingsReady(true);
        setSettingsError(err instanceof Error ? err.message : "Could not load booking status.");
      });
    return () => {
      cancelled = true;
    };
  }, [token, business?.id, isActive]);

  const toggleKiosk = useCallback(
    async (next: boolean) => {
      if (!token || !business?.id) return;
      setSettingsBusy(true);
      setSettingsError(null);
      try {
        const settings = await api.updateBookingSettings(token, business.id, { enabled: next });
        setKioskEnabled(settings.enabled);
      } catch (err) {
        setSettingsError(err instanceof Error ? err.message : "Could not update booking status.");
      } finally {
        setSettingsBusy(false);
      }
    },
    [token, business?.id],
  );

  const priceLabel = (status?.addon.price_display ?? "Rp199.000/month").replace(
    /\/\s*month/i,
    "",
  );
  const productName = status?.addon.name ?? "Booking";
  const compactChrome = isActive && manageTab !== "setup";
  const productDescription =
    status?.addon.description ??
    "Let visitors book a doctor by voice. Add people, set their hours, and take appointments from the kiosk.";

  const footerStyle = {
    left: isMobile
      ? "0px"
      : sidebarState === "collapsed"
        ? "var(--sidebar-width-icon)"
        : "var(--sidebar-width)",
  } as const;

  return (
    <>
      <div
        className={cn(
          "w-full",
          isActive ? "space-y-6 pb-6" : "mx-auto max-w-3xl space-y-10 pb-24",
        )}
      >
        {error ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {loading ? (
          <div className="flex gap-4">
            <div className="size-[88px] shrink-0 animate-pulse rounded-[22px] bg-slate-100" />
            <div className="flex-1 space-y-3 py-1">
              <div className="h-7 w-48 animate-pulse rounded bg-slate-100" />
              <div className="h-4 w-64 animate-pulse rounded bg-slate-100" />
            </div>
          </div>
        ) : (
          <header className="flex items-start gap-3 sm:gap-4">
            <div
              className={cn(
                "flex shrink-0 items-center justify-center bg-gradient-to-br from-teal-500 to-emerald-600 shadow-sm",
                compactChrome
                  ? "size-12 rounded-2xl"
                  : "size-[88px] rounded-[22px] sm:size-[104px] sm:rounded-[26px]",
              )}
            >
              <CalendarDaysIcon
                className={cn(
                  "text-white",
                  compactChrome ? "size-6" : "size-10 sm:size-12",
                )}
                aria-hidden
              />
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <h1
                className={cn(
                  "font-semibold tracking-tight text-slate-900",
                  compactChrome ? "text-lg sm:text-xl" : "text-[22px] sm:text-[28px]",
                )}
              >
                {productName}
              </h1>
              {compactChrome ? (
                <p className="mt-0.5 text-xs font-medium text-emerald-600">
                  {kioskEnabled ? "Installed · Active" : "Installed · Inactive"}
                </p>
              ) : (
                <>
                  <p className="mt-0.5 text-sm text-orange-600 sm:text-[15px]">LORESCALE Add-on</p>
                  <p className="mt-2 text-sm text-slate-500">
                    {isActive ? (
                      <span
                        className={`inline-flex items-center gap-1 font-medium ${
                          kioskEnabled ? "text-emerald-600" : "text-slate-500"
                        }`}
                      >
                        <CheckCircleIcon className="size-4" aria-hidden />
                        {kioskEnabled ? "Installed" : "Installed · Inactive"}
                      </span>
                    ) : isPending ? (
                      <span className="inline-flex items-center gap-1 font-medium text-amber-600">
                        <ClockIcon className="size-4" aria-hidden />
                        Pending approval
                      </span>
                    ) : (
                      <>
                        <span className="font-semibold text-slate-900">{priceLabel}</span>
                        <span className="text-slate-400"> / month · per workspace</span>
                      </>
                    )}
                  </p>
                </>
              )}
            </div>
          </header>
        )}

        {!loading && isActive && token && business?.id ? (
          <div className="space-y-4">
            {settingsError ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {settingsError}
              </p>
            ) : null}
            <nav
              role="tablist"
              aria-label="Booking sections"
              className="flex gap-1 border-b border-slate-200"
            >
              {MANAGE_TABS.map((item) => {
                const Icon = item.icon;
                const active = manageTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setManageTab(item.id)}
                    className={cn(
                      "relative -mb-px inline-flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors",
                      active
                        ? "border-orange-500 text-slate-900"
                        : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800",
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                    {item.label}
                  </button>
                );
              })}
            </nav>
            {manageTab === "setup" ? (
              <div className="space-y-8">
                {settingsReady ? (
                  <BookingEnabledToggle
                    enabled={kioskEnabled}
                    busy={settingsBusy}
                    onChange={(next) => void toggleKiosk(next)}
                  />
                ) : (
                  <div className="h-16 animate-pulse rounded-xl bg-slate-100" />
                )}
                <ManageBooking token={token} businessId={business.id} />
              </div>
            ) : manageTab === "calendar" ? (
              <BookingCalendar token={token} businessId={business.id} />
            ) : manageTab === "knowledge" ? (
              <BookingKnowledge token={token} businessId={business.id} />
            ) : (
              <BookingBookingsTable
                token={token}
                businessId={business.id}
                businessSlug={slug}
              />
            )}
          </div>
        ) : !loading ? (
          <>
            <section className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight text-slate-900">About</h2>
              <p className="text-[15px] leading-relaxed text-slate-600">{productDescription}</p>
              <p className="text-[15px] leading-relaxed text-slate-600">
                Built for clinics and reception desks. Hotel rooms and multi-resource calendars are
                not in this version.
              </p>
            </section>
            <section>
              <h2 className="mb-1 text-xl font-semibold tracking-tight text-slate-900">Features</h2>
              <ul className="divide-y divide-slate-100">
                {FEATURES.map(({ icon: Icon, title, body }) => (
                  <li key={title} className="flex gap-4 py-4">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-50 text-slate-700">
                      <Icon className="size-5" aria-hidden />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-[15px] font-semibold text-slate-900">{title}</h3>
                      <p className="mt-0.5 text-sm leading-relaxed text-slate-500">{body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : null}
      </div>

      {!isActive ? (
        <footer
          style={footerStyle}
          className="fixed bottom-0 right-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/80 lg:px-6"
        >
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{productName}</p>
              <p className="truncate text-xs text-slate-500">
                {isPending
                  ? "Waiting for payment approval"
                  : `${priceLabel}/mo · per workspace`}
              </p>
            </div>
            {isPending ? (
              <Button variant="outline" disabled>
                Requested
              </Button>
            ) : loading ? (
              <Button variant="outline" disabled>
                Subscribe
              </Button>
            ) : (
              <Button asChild>
                <Link href={adminPath(slug, "/add-ons/booking/payment")}>Subscribe</Link>
              </Button>
            )}
          </div>
        </footer>
      ) : null}
    </>
  );
}
