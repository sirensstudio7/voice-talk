"use client";

import {
  ArrowDownTrayIcon,
  CalendarDaysIcon,
  CheckIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon,
  TableCellsIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api, type Appointment } from "@/lib/api";
import { cn } from "@/lib/cn";
import {
  formatShortDateLabel,
  parseApiDate,
  toDateInputValue,
  todayDateInputValue,
  yesterdayDateInputValue,
} from "@/lib/dates";
import { exportBookingsCsv, exportBookingsXls } from "@/lib/export-bookings";

type StatusFilter = "all" | "scheduled" | "cancelled";

const STATUS_FILTERS: Array<{ id: StatusFilter; label: string }> = [
  { id: "all", label: "All statuses" },
  { id: "scheduled", label: "Scheduled" },
  { id: "cancelled", label: "Cancelled" },
];

function dateFilterLabel(value: string | null, today: string, yesterday: string) {
  if (value === null) return "All dates";
  if (value === today) return "Today";
  if (value === yesterday) return "Yesterday";
  return formatShortDateLabel(value);
}

function FilterCheck({ selected }: { selected: boolean }) {
  return (
    <CheckIcon
      className={cn("ml-auto size-4 text-orange-500", selected ? "opacity-100" : "opacity-0")}
    />
  );
}

function formatDate(iso: string) {
  return parseApiDate(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTimeRange(startsAt: string, endsAt: string) {
  const opts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  return `${parseApiDate(startsAt).toLocaleTimeString(undefined, opts)} – ${parseApiDate(endsAt).toLocaleTimeString(undefined, opts)}`;
}

function StatusBadge({ status }: { status: string }) {
  const cancelled = status.toLowerCase() === "cancelled";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ring-1 ring-inset",
        cancelled
          ? "bg-red-50 text-red-700 ring-red-600/20"
          : "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
      )}
    >
      {status}
    </span>
  );
}

export function BookingBookingsTable({
  token,
  businessId,
  businessSlug,
}: {
  token: string;
  businessId: string;
  businessSlug: string;
}) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [dateMenuOpen, setDateMenuOpen] = useState(false);
  const today = todayDateInputValue();
  const yesterday = yesterdayDateInputValue();
  const isCustomDate =
    selectedDate !== null && selectedDate !== today && selectedDate !== yesterday;

  const load = useCallback(async (showPending = false) => {
    if (showPending) setLoading(true);
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
    void load(true);
    const interval = window.setInterval(() => {
      void api.listAppointments(token, businessId).then(setAppointments).catch(() => undefined);
    }, 15000);
    return () => window.clearInterval(interval);
  }, [load, token, businessId]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...appointments]
      .filter((item) => {
        if (selectedDate && toDateInputValue(parseApiDate(item.starts_at)) !== selectedDate) {
          return false;
        }
        if (statusFilter !== "all" && item.status.toLowerCase() !== statusFilter) {
          return false;
        }
        if (!needle) return true;
        const haystack = [
          item.customer_name,
          item.customer_phone,
          item.staff_name ?? "",
          item.treatment_name,
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(needle);
      })
      .sort(
        (a, b) => parseApiDate(b.created_at).getTime() - parseApiDate(a.created_at).getTime(),
      );
  }, [appointments, query, selectedDate, statusFilter]);

  const scheduledCount = rows.filter((item) => item.status !== "cancelled").length;

  const handleCancel = async (appointment: Appointment) => {
    if (
      !window.confirm(`Cancel ${appointment.treatment_name} for ${appointment.customer_name}?`)
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

  const exportPayload = {
    businessSlug,
    appointments: rows,
    filterDate: selectedDate,
  };

  return (
    <div className="space-y-4">
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Customer bookings</h2>
          <p className="text-sm text-slate-500">
            {loading
              ? "Loading bookings…"
              : `${rows.length} ${rows.length === 1 ? "row" : "rows"} · ${scheduledCount} scheduled`}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={rows.length === 0}>
              <ArrowDownTrayIcon />
              Download
              <ChevronDownIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => exportBookingsCsv(exportPayload)}>
              <TableCellsIcon />
              Download CSV
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => exportBookingsXls(exportPayload)}>
              <TableCellsIcon />
              Download Excel
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative min-w-0 w-full sm:max-w-xs">
          <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <input
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pr-3 pl-9 text-sm text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
            placeholder="Search name, phone, doctor…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="flex items-center justify-end gap-2">
          <DropdownMenu open={dateMenuOpen} onOpenChange={setDateMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <CalendarDaysIcon className="text-slate-400" />
                {dateFilterLabel(selectedDate, today, yesterday)}
                <ChevronDownIcon className="text-slate-400" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onSelect={() => setSelectedDate(null)}>
                All dates
                <FilterCheck selected={selectedDate === null} />
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setSelectedDate(today)}>
                Today
                <FilterCheck selected={selectedDate === today} />
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setSelectedDate(yesterday)}>
                Yesterday
                <FilterCheck selected={selectedDate === yesterday} />
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <div
                className="px-2 py-1.5"
                onPointerDown={(event) => event.preventDefault()}
              >
                <label htmlFor="booking-table-date" className="text-xs font-medium text-slate-500">
                  Custom date
                </label>
                <input
                  id="booking-table-date"
                  type="date"
                  value={isCustomDate ? selectedDate : ""}
                  onChange={(event) => {
                    setSelectedDate(event.target.value || null);
                    if (event.target.value) setDateMenuOpen(false);
                  }}
                  className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                />
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                {STATUS_FILTERS.find((item) => item.id === statusFilter)?.label ?? "All statuses"}
                <ChevronDownIcon className="text-slate-400" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {STATUS_FILTERS.map((item) => (
                <DropdownMenuItem key={item.id} onSelect={() => setStatusFilter(item.id)}>
                  {item.label}
                  <FilterCheck selected={statusFilter === item.id} />
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
            <tr>
              <th className="px-3 py-2.5 whitespace-nowrap">Date</th>
              <th className="px-3 py-2.5 whitespace-nowrap">Time</th>
              <th className="px-3 py-2.5">Customer</th>
              <th className="px-3 py-2.5">Doctor</th>
              <th className="px-3 py-2.5">Service</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5 text-right">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? [0, 1, 2, 3, 4].map((index) => (
                  <tr key={index} className="border-t border-slate-100">
                    <td colSpan={7} className="px-3 py-3">
                      <div className="h-4 animate-pulse rounded bg-slate-100" />
                    </td>
                  </tr>
                ))
              : rows.map((appointment) => {
                  const cancelled = appointment.status === "cancelled";
                  return (
                    <tr
                      key={appointment.id}
                      className={cn("border-t border-slate-100", cancelled && "text-slate-400")}
                    >
                      <td className="px-3 py-2.5 whitespace-nowrap text-slate-700">
                        {formatDate(appointment.starts_at)}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap tabular-nums text-slate-700">
                        {formatTimeRange(appointment.starts_at, appointment.ends_at)}
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-slate-900">{appointment.customer_name}</p>
                        {appointment.customer_phone ? (
                          <p className="text-xs text-slate-500">{appointment.customer_phone}</p>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 text-slate-700">
                        {appointment.staff_name || "—"}
                      </td>
                      <td className="px-3 py-2.5 text-slate-700">{appointment.treatment_name}</td>
                      <td className="px-3 py-2.5">
                        <StatusBadge status={appointment.status} />
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {!cancelled ? (
                          <button
                            type="button"
                            disabled={cancellingId === appointment.id}
                            onClick={() => void handleCancel(appointment)}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                          >
                            <XCircleIcon className="size-3.5" />
                            {cancellingId === appointment.id ? "Cancelling…" : "Cancel"}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
        {!loading && rows.length === 0 ? (
          <p className="border-t border-slate-100 px-4 py-10 text-center text-sm text-slate-500">
            {appointments.length === 0
              ? "No customer bookings yet."
              : "No bookings match these filters."}
          </p>
        ) : null}
      </div>
    </div>
  );
}
