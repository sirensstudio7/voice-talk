"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Phone, Scissors, User, XCircle } from "lucide-react";

import { DateFilter } from "@/components/date-filter";
import { PageHeader, StatCard } from "@/components/ui";
import { api, type Appointment } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatFilterDateLabel, parseApiDate } from "@/lib/dates";

function formatTimeRange(startsAt: string, endsAt: string) {
  const start = parseApiDate(startsAt);
  const end = parseApiDate(endsAt);
  const timeFmt = (date: Date) =>
    date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${timeFmt(start)} – ${timeFmt(end)}`;
}

function formatDateLabel(iso: string) {
  const date = parseApiDate(iso);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === now.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function groupByDate(appointments: Appointment[]) {
  const sorted = [...appointments].sort(
    (a, b) => parseApiDate(a.starts_at).getTime() - parseApiDate(b.starts_at).getTime(),
  );

  const groups = new Map<string, Appointment[]>();
  for (const appointment of sorted) {
    const key = parseApiDate(appointment.starts_at).toDateString();
    const existing = groups.get(key) ?? [];
    existing.push(appointment);
    groups.set(key, existing);
  }

  return Array.from(groups.entries()).map(([, items]) => ({
    label: formatDateLabel(items[0].starts_at),
    appointments: items,
  }));
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    scheduled: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    cancelled: "bg-red-50 text-red-700 ring-red-600/20",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${
        styles[status.toLowerCase()] ?? "bg-slate-100 text-slate-600 ring-slate-500/10"
      }`}
    >
      {status}
    </span>
  );
}

function AppointmentRow({
  appointment,
  cancelling,
  onCancel,
}: {
  appointment: Appointment;
  cancelling: boolean;
  onCancel: () => void;
}) {
  const isCancelled = appointment.status === "cancelled";

  return (
    <article className="rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-base font-semibold text-slate-900">
            <Scissors className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
            <span className="truncate">{appointment.treatment_name}</span>
          </p>

          <p className="mt-1.5 flex items-center gap-1.5 text-sm text-slate-600">
            <User className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
            <span className="truncate">{appointment.customer_name}</span>
          </p>

          {appointment.customer_phone ? (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
              <Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
              <span>{appointment.customer_phone}</span>
            </p>
          ) : null}

          <p className="mt-2 text-xs font-medium text-slate-500">
            {formatTimeRange(appointment.starts_at, appointment.ends_at)}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <StatusBadge status={appointment.status} />
          {!isCancelled ? (
            <button
              type="button"
              disabled={cancelling}
              onClick={onCancel}
              className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <XCircle className="h-3.5 w-3.5" />
              {cancelling ? "Cancelling…" : "Cancel"}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function AppointmentsPageClient() {
  const { token, business } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const load = async () => {
    if (!token || !business) return;
    setLoading(true);
    try {
      setAppointments(await api.listAppointments(token, business.id, selectedDate ?? undefined));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => {
      if (!token || !business) return;
      void api
        .listAppointments(token, business.id, selectedDate ?? undefined)
        .then(setAppointments);
    }, 15000);
    return () => window.clearInterval(interval);
  }, [token, business, selectedDate]);

  const groups = useMemo(() => groupByDate(appointments), [appointments]);

  const scheduledCount = useMemo(
    () => appointments.filter((item) => item.status !== "cancelled").length,
    [appointments],
  );

  const subtitle = useMemo(() => {
    if (loading) return "Loading appointments…";
    if (appointments.length === 0) {
      return selectedDate
        ? `No appointments on ${formatFilterDateLabel(selectedDate)}.`
        : "Bookings from your customer page and voice assistant.";
    }
    return `${scheduledCount} scheduled ${scheduledCount === 1 ? "appointment" : "appointments"}`;
  }, [loading, appointments.length, scheduledCount, selectedDate]);

  const handleCancel = async (appointment: Appointment) => {
    if (!token || !business) return;
    if (
      !window.confirm(
        `Cancel ${appointment.treatment_name} for ${appointment.customer_name}?`,
      )
    ) {
      return;
    }

    setCancellingId(appointment.id);
    try {
      await api.cancelAppointment(token, business.id, appointment.id);
      await load();
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <>
      <PageHeader title="Appointments" subtitle={subtitle} />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <DateFilter
          id="appointments-date-filter"
          value={selectedDate}
          onChange={setSelectedDate}
        />
      </div>

      {!loading && appointments.length > 0 ? (
        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <StatCard label="Total shown" value={String(appointments.length)} />
          <StatCard label="Scheduled" value={String(scheduledCount)} />
        </div>
      ) : null}

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              className="h-24 animate-pulse rounded-xl border border-slate-200 bg-white"
            />
          ))}
        </div>
      ) : appointments.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-8 py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-orange-500">
            <CalendarDays className="h-7 w-7" />
          </div>
          <p className="text-lg font-semibold text-slate-900">No appointments yet</p>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-500">
            Add treatments to your menu and set your schedule. Customers can book from your
            customer page or through Lorescale.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.label}>
              <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                {group.label}
              </h2>
              <div className="space-y-3">
                {group.appointments.map((appointment) => (
                  <AppointmentRow
                    key={appointment.id}
                    appointment={appointment}
                    cancelling={cancellingId === appointment.id}
                    onCancel={() => {
                      void handleCancel(appointment);
                    }}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
