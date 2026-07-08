"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, CheckCircle2, Clock, X } from "lucide-react";

import { slideOverBackdropClass, slideOverPanelClass, useSlideOver } from "@/components/slide-over";
import { useBusinessSlug } from "@/context/business-context";
import { bookAppointment, fetchAvailability } from "@/lib/appointment-api";
import { useSessionStore } from "@/store/session-store";

function formatSlotLabel(iso: string) {
  const date = new Date(iso);
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function nextDateOptions(count = 14) {
  const options: { value: string; label: string }[] = [];
  const now = new Date();

  for (let offset = 0; offset < count; offset += 1) {
    const date = new Date(now);
    date.setDate(now.getDate() + offset);
    const value = date.toISOString().slice(0, 10);
    const label =
      offset === 0
        ? "Today"
        : offset === 1
          ? "Tomorrow"
          : date.toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
            });
    options.push({ value, label });
  }

  return options;
}

const inputClassName =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-orange-500";

function AppointmentBookingPanel({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const businessSlug = useBusinessSlug();
  const selectedTreatment = useSessionStore((s) => s.selectedTreatment);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [slots, setSlots] = useState<string[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const dateOptions = useMemo(() => nextDateOptions(), []);

  useEffect(() => {
    if (!visible || !selectedTreatment) return;

    setLoadingSlots(true);
    setError(null);
    setSelectedSlot(null);
    void fetchAvailability(businessSlug, selectedTreatment.productId, selectedDate)
      .then((data) => setSlots(data))
      .catch((err) => {
        setSlots([]);
        setError(err instanceof Error ? err.message : "Could not load slots.");
      })
      .finally(() => setLoadingSlots(false));
  }, [visible, selectedTreatment, selectedDate, businessSlug]);

  useEffect(() => {
    if (!visible) {
      setSuccess(false);
      setError(null);
      setSelectedSlot(null);
      setCustomerName("");
      setCustomerPhone("");
    }
  }, [visible]);

  const canBook =
    selectedTreatment &&
    selectedSlot &&
    customerName.trim().length > 0 &&
    !booking &&
    !success;

  const handleBook = async () => {
    if (!selectedTreatment || !selectedSlot || !canBook) return;

    setBooking(true);
    setError(null);
    try {
      await bookAppointment(businessSlug, {
        product_id: selectedTreatment.productId,
        starts_at: selectedSlot,
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
      });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not book appointment.");
    } finally {
      setBooking(false);
    }
  };

  if (!selectedTreatment) return null;

  return (
    <>
      <button
        type="button"
        className={`${slideOverBackdropClass(visible)} z-[60]`}
        onClick={onClose}
        aria-label="Close booking panel"
      />

      <aside className={`${slideOverPanelClass(visible, "z-[70] bg-slate-50")}`}>
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-orange-500">
              Book appointment
            </p>
            <h2 className="text-lg font-bold text-slate-900">{selectedTreatment.name}</h2>
            {selectedTreatment.durationMin ? (
              <p className="mt-0.5 text-xs text-slate-500">{selectedTreatment.durationMin} min</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition hover:bg-slate-50"
            aria-label="Close booking panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {success ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-12 text-center">
              <CheckCircle2 className="h-12 w-12 text-emerald-500" />
              <p className="mt-4 text-lg font-semibold text-slate-900">Appointment booked</p>
              <p className="mt-2 text-sm text-slate-600">
                {selectedTreatment.name} on{" "}
                {selectedSlot ? formatSlotLabel(selectedSlot) : "your selected time"}.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-6 rounded-full bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600"
              >
                Done
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <section>
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <CalendarDays className="h-4 w-4 text-slate-400" />
                  Choose a date
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {dateOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setSelectedDate(option.value)}
                      className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold transition ${
                        selectedDate === option.value
                          ? "bg-slate-900 text-white"
                          : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <Clock className="h-4 w-4 text-slate-400" />
                  Available times
                </div>
                {loadingSlots ? (
                  <div className="grid grid-cols-3 gap-2">
                    {[0, 1, 2, 3, 4, 5].map((index) => (
                      <div key={index} className="h-10 animate-pulse rounded-xl bg-slate-200" />
                    ))}
                  </div>
                ) : slots.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
                    No open slots on this day. Try another date.
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {slots.map((slot) => (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => setSelectedSlot(slot)}
                        className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                          selectedSlot === slot
                            ? "bg-orange-500 text-white"
                            : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
                        }`}
                      >
                        {formatSlotLabel(slot)}
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <section className="space-y-3">
                <div>
                  <label htmlFor="booking-name" className="mb-1.5 block text-sm font-medium text-slate-700">
                    Your name
                  </label>
                  <input
                    id="booking-name"
                    className={inputClassName}
                    value={customerName}
                    onChange={(event) => setCustomerName(event.target.value)}
                    placeholder="Full name"
                  />
                </div>
                <div>
                  <label htmlFor="booking-phone" className="mb-1.5 block text-sm font-medium text-slate-700">
                    Phone number
                  </label>
                  <input
                    id="booking-phone"
                    className={inputClassName}
                    value={customerPhone}
                    onChange={(event) => setCustomerPhone(event.target.value)}
                    placeholder="Optional"
                  />
                </div>
              </section>

              {error ? (
                <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </p>
              ) : null}
            </div>
          )}
        </div>

        {!success ? (
          <div className="shrink-0 border-t border-slate-200 bg-white px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              disabled={!canBook}
              onClick={() => {
                void handleBook();
              }}
              className="inline-flex w-full items-center justify-center rounded-full bg-orange-500 py-3.5 text-[15px] font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {booking ? "Booking…" : "Confirm booking"}
            </button>
          </div>
        ) : null}
      </aside>
    </>
  );
}

export function AppointmentBookingPanelRoot() {
  const bookingPanelOpen = useSessionStore((s) => s.bookingPanelOpen);
  const closeBookingPanel = useSessionStore((s) => s.closeBookingPanel);
  const { mounted, isRendered, isVisible } = useSlideOver(bookingPanelOpen);

  if (!mounted || !isRendered) return null;

  return createPortal(
    <AppointmentBookingPanel visible={isVisible} onClose={closeBookingPanel} />,
    document.body,
  );
}
