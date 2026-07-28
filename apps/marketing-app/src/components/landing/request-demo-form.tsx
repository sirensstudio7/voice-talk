"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRightIcon,
  CalendarDaysIcon,
} from "@heroicons/react/24/outline";
import { City, Country } from "country-state-city";

import { AppointmentScheduler } from "@/components/landing/appointment-scheduler";
import { LorescaleLogo } from "@/components/landing/lorescale-logo";
import {
  DemoActions,
  DemoBackButton,
  DemoContinueButton,
  DemoRequestLayout,
  SelectionCard,
} from "@/components/landing/request-demo-shell";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { cn } from "@/lib/cn";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const INDUSTRIES = [
  {
    id: "Cafe",
    label: "Cafe",
    description: "Coffee shops, bakeries, and casual dining spots",
  },
  {
    id: "Restaurant",
    label: "Restaurant",
    description: "Full-service restaurants, bars, and food halls",
  },
  {
    id: "Salon/Spa",
    label: "Salon & spa",
    description: "Hair, beauty, grooming, and wellness services",
  },
  {
    id: "Retail",
    label: "Retail",
    description: "Stores, boutiques, and product-led businesses",
  },
  {
    id: "Hotel",
    label: "Hotel",
    description: "Hotels, resorts, and hospitality front desk",
  },
  {
    id: "Clinic",
    label: "Clinic",
    description: "Medical, dental, and healthcare practices",
  },
  {
    id: "SaaS",
    label: "SaaS",
    description: "Software products and digital service companies",
  },
  {
    id: "Other",
    label: "Other",
    description: "Any other type of business",
  },
] as const;

const BRANCH_OPTIONS = [
  {
    value: 1,
    label: "1 branch",
    description: "Single location getting started with voice AI",
  },
  {
    value: 3,
    label: "2–5 branches",
    description: "Growing multi-location rollout",
  },
  {
    value: 6,
    label: "6+ branches",
    description: "Enterprise-scale deployment across sites",
  },
] as const;

const COUNTRY_OPTIONS = Country.getAllCountries().map((country) => ({
  isoCode: country.isoCode,
  name: country.name,
  phonecode: country.phonecode.replace(/\D/g, ""),
}));

const COUNTRY_SELECT_OPTIONS = COUNTRY_OPTIONS.map((country) => ({
  value: country.isoCode,
  label: country.name,
}));

function formatDialCode(phonecode: string) {
  return phonecode ? `+${phonecode}` : "";
}

function buildFullPhone(dialCode: string, localNumber: string) {
  const local = localNumber.replace(/\s+/g, "").replace(/^0+/, "");
  if (!dialCode) return localNumber.trim();
  if (!local) return dialCode;
  return `${dialCode}${local}`;
}

const TIME_SLOTS = ["09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00"] as const;

type FormState = {
  email: string;
  phone: string;
  company_name: string;
  city: string;
  country: string;
  country_code: string;
  business_industry: string;
  branch_total: number | null;
  preferred_date: string;
  preferred_time: string;
};

const INITIAL_FORM: FormState = {
  email: "",
  phone: "",
  company_name: "",
  city: "",
  country: "",
  country_code: "",
  business_industry: "",
  branch_total: null,
  preferred_date: "",
  preferred_time: "",
};

const fieldLabelClass = "mb-1.5 block text-sm font-medium text-slate-700";
const fieldInputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-orange-400 focus:ring-2 focus:ring-orange-500/20";

const STEP_COPY: Record<number, { title: string; subtitle: string }> = {
  1: {
    title: "What's your company name?",
    subtitle: "Tell us about the business you'd like to demo.",
  },
  2: {
    title: "Where is your business based?",
    subtitle: "Choose country and city so we can tailor follow-up.",
  },
  3: {
    title: "How can we reach you?",
    subtitle: "We'll use these details to schedule your walkthrough.",
  },
  4: {
    title: "What type of business do you run?",
    subtitle: "Choose business industry",
  },
  5: {
    title: "How many branches do you operate?",
    subtitle: "Choose branch scale",
  },
  6: {
    title: "When should we schedule your demo?",
    subtitle: "Pick a preferred date and time — we'll confirm by email.",
  },
};

export function RequestDemoForm() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const cities = useMemo(() => {
    if (!form.country_code) return [];
    const list = City.getCitiesOfCountry(form.country_code) ?? [];
    return Array.from(new Set(list.map((city) => city.name))).sort((a, b) =>
      a.localeCompare(b),
    );
  }, [form.country_code]);

  const cityOptions = useMemo(
    () => cities.map((city) => ({ value: city, label: city })),
    [cities],
  );

  const dialCode = useMemo(() => {
    const selected = COUNTRY_OPTIONS.find((c) => c.isoCode === form.country_code);
    return formatDialCode(selected?.phonecode ?? "");
  }, [form.country_code]);

  const canContinue =
    (step === 1 && form.company_name.trim().length > 0) ||
    (step === 2 && Boolean(form.country_code) && form.city.trim().length > 0) ||
    (step === 3 &&
      form.email.trim().length > 0 &&
      form.phone.trim().length > 0 &&
      Boolean(form.country_code)) ||
    (step === 4 && Boolean(form.business_industry)) ||
    (step === 5 && form.branch_total !== null) ||
    (step === 6 && Boolean(form.preferred_date) && Boolean(form.preferred_time));

  async function submit() {
    if (form.branch_total === null) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/public/demo-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email.trim(),
          phone: buildFullPhone(dialCode, form.phone),
          company_name: form.company_name.trim(),
          city: form.city.trim(),
          country: form.country.trim(),
          business_industry: form.business_industry,
          branch_total: form.branch_total,
          preferred_date: form.preferred_date,
          preferred_time: form.preferred_time,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { detail?: string };
      if (!response.ok) {
        throw new Error(typeof data.detail === "string" ? data.detail : "Could not submit request.");
      }
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit request.");
    } finally {
      setLoading(false);
    }
  }

  function handleContinue() {
    setError(null);
    if (step < 6) {
      setStep((current) => current + 1);
      return;
    }
    void submit();
  }

  function handleBack() {
    setError(null);
    if (step === 1) return;
    setStep((current) => current - 1);
  }

  if (success) {
    const dateParts = (() => {
      if (!form.preferred_date) return null;
      const date = new Date(`${form.preferred_date}T12:00:00`);
      if (Number.isNaN(date.getTime())) return null;
      return {
        weekday: date.toLocaleDateString("en-US", { weekday: "long" }),
        month: date.toLocaleDateString("en-US", { month: "short" }).toUpperCase(),
        day: String(date.getDate()),
        year: String(date.getFullYear()),
      };
    })();

    const timeLabel = (() => {
      if (!form.preferred_time) return null;
      const [hours, minutes] = form.preferred_time.split(":");
      const hour = Number.parseInt(hours, 10);
      const ampm = hour >= 12 ? "PM" : "AM";
      const hour12 = hour % 12 || 12;
      return `${hour12}:${minutes} ${ampm}`;
    })();

    return (
      <div className="flex h-dvh flex-col bg-[#f4f5f7] text-[#181818]" data-lenis-prevent>
        <header className="flex shrink-0 items-center justify-between bg-[#f4f5f7] px-6 py-5 md:px-10">
          <Link href="/" className="flex items-center gap-3">
            <LorescaleLogo className="h-8 w-auto" />
            <span className="text-lg font-semibold tracking-tight">Lorescale</span>
          </Link>
          <Link
            href="/"
            className="text-sm font-medium text-[#46484d] transition hover:text-[#181818]"
          >
            Home
          </Link>
        </header>

        <main className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4 py-8 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-3xl border border-dashed border-black/[0.12] bg-white shadow-[0_24px_60px_-36px_rgba(15,23,42,0.35)]"
          >
            <div className="flex items-center justify-between border-b border-dashed border-black/[0.1] px-5 py-3 sm:px-8">
              <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[#46484d]">
                Demo request confirmed
              </p>
              <p className="font-mono text-[11px] tabular-nums text-[#94a3b8]">
                #{(form.company_name.slice(0, 3) || "LS").toUpperCase()}
                {(form.preferred_date || "").replace(/-/g, "").slice(4) || "0000"}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[1.05fr_0.95fr]">
              <div className="border-b border-dashed border-black/[0.1] px-5 py-8 sm:px-8 md:border-b-0 md:border-r">
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.15 }}
                  className="text-sm text-[#46484d]"
                >
                  For {form.company_name || "your team"}
                </motion.p>
                <motion.h1
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, duration: 0.4 }}
                  className="mt-3 text-[clamp(2rem,5vw,3.25rem)] font-semibold leading-[1.05] tracking-tight"
                >
                  We&apos;ll see you
                  <br />
                  on the call.
                </motion.h1>
                <p className="mt-5 max-w-sm text-sm leading-relaxed text-[#46484d]">
                  Your request is in. Confirmation goes to{" "}
                  <span className="font-medium text-[#181818]">{form.email}</span>.
                </p>

                <div className="mt-10 flex flex-wrap gap-x-8 gap-y-4 text-sm">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.16em] text-[#94a3b8]">
                      Industry
                    </p>
                    <p className="mt-1 font-medium">{form.business_industry || "—"}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.16em] text-[#94a3b8]">
                      Location
                    </p>
                    <p className="mt-1 font-medium">
                      {[form.city, form.country].filter(Boolean).join(", ") || "—"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="relative flex flex-col justify-between px-5 py-8 sm:px-8">
                {dateParts ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.25, duration: 0.4 }}
                    className="flex items-end gap-4"
                  >
                    <p className="text-[6.5rem] font-semibold leading-none tracking-tight tabular-nums sm:text-[7.5rem]">
                      {dateParts.day}
                    </p>
                    <div className="mb-3 space-y-1">
                      <p className="text-sm font-semibold tracking-wide">{dateParts.month}</p>
                      <p className="text-sm text-[#46484d]">{dateParts.year}</p>
                      <p className="text-sm text-[#46484d]">{dateParts.weekday}</p>
                    </div>
                  </motion.div>
                ) : (
                  <div>
                    <CalendarDaysIcon className="size-8 text-[#94a3b8]" />
                    <p className="mt-3 text-sm text-[#46484d]">Schedule to be confirmed</p>
                  </div>
                )}

                <div className="mt-8 border-t border-dashed border-black/[0.1] pt-6">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-[#94a3b8]">
                    Preferred time
                  </p>
                  <p className="mt-2 font-mono text-3xl font-semibold tracking-tight tabular-nums">
                    {timeLabel ?? "—"}
                  </p>
                  <p className="mt-2 text-xs text-[#94a3b8]">We&apos;ll confirm by email</p>
                </div>
              </div>
            </div>

            <div className="border-t border-dashed border-black/[0.1] px-5 py-5 sm:px-8">
              <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                <ol className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:gap-0">
                  {["Review", "Confirm", "Demo"].map((label, index) => (
                    <li key={label} className="flex items-center gap-3 sm:flex-1">
                      <span className="font-mono text-[11px] tabular-nums text-[#94a3b8]">
                        0{index + 1}
                      </span>
                      <span className="text-sm font-medium">{label}</span>
                      {index < 2 ? (
                        <span
                          aria-hidden
                          className="mx-3 hidden h-px flex-1 bg-black/[0.1] sm:block"
                        />
                      ) : null}
                    </li>
                  ))}
                </ol>

                <Link
                  href="/"
                  className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-md bg-[#181818] px-5 text-sm font-medium text-white transition hover:bg-black"
                >
                  Back to home
                  <ArrowRightIcon className="size-4" />
                </Link>
              </div>
            </div>
          </motion.div>
        </main>
      </div>
    );
  }

  const { title, subtitle } = STEP_COPY[step];

  return (
    <DemoRequestLayout
      activeStep={step}
      title={title}
      subtitle={subtitle}
      contentClassName={step === 6 ? "max-w-5xl" : undefined}
      footer={
        <DemoActions
          back={
            step > 1 ? <DemoBackButton onClick={handleBack} disabled={loading} /> : undefined
          }
        >
          <DemoContinueButton
            onClick={handleContinue}
            disabled={!canContinue}
            loading={loading && step === 6}
          >
            {loading && step === 6 ? "Submitting…" : step === 6 ? "Submit request" : "Continue"}
          </DemoContinueButton>
        </DemoActions>
      }
    >
      <div className="space-y-4">
        {step === 1 ? (
          <div>
            <label htmlFor="company_name" className={fieldLabelClass}>
              Company name
            </label>
            <input
              id="company_name"
              name="company_name"
              required
              autoFocus
              autoComplete="organization"
              placeholder="Acme Coffee"
              className={fieldInputClass}
              value={form.company_name}
              onChange={(e) => setForm((prev) => ({ ...prev, company_name: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canContinue) {
                  e.preventDefault();
                  handleContinue();
                }
              }}
            />
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-5">
            <div>
              <label htmlFor="country" className={fieldLabelClass}>
                Country
              </label>
              <SearchableSelect
                id="country"
                value={form.country_code}
                options={COUNTRY_SELECT_OPTIONS}
                placeholder="Select country"
                searchPlaceholder="Search country…"
                emptyText="No countries found."
                onChange={(code) => {
                  const selected = COUNTRY_OPTIONS.find((c) => c.isoCode === code);
                  setForm((prev) => ({
                    ...prev,
                    country_code: code,
                    country: selected?.name ?? "",
                    city: "",
                  }));
                }}
              />
            </div>
            <div>
              <label htmlFor="city" className={fieldLabelClass}>
                City
              </label>
              {cityOptions.length > 0 ? (
                <SearchableSelect
                  id="city"
                  disabled={!form.country_code}
                  value={form.city}
                  options={cityOptions}
                  placeholder={form.country_code ? "Select city" : "Select country first"}
                  searchPlaceholder="Search city…"
                  emptyText="No cities found."
                  onChange={(city) => setForm((prev) => ({ ...prev, city }))}
                />
              ) : (
                <input
                  id="city"
                  required
                  disabled={!form.country_code}
                  autoComplete="address-level2"
                  placeholder={form.country_code ? "Enter city" : "Select country first"}
                  className={cn(
                    fieldInputClass,
                    "disabled:cursor-not-allowed disabled:bg-slate-50",
                  )}
                  value={form.city}
                  onChange={(e) => setForm((prev) => ({ ...prev, city: e.target.value }))}
                />
              )}
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-5">
            <div>
              <label htmlFor="email" className={fieldLabelClass}>
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoFocus
                autoComplete="email"
                placeholder="you@company.com"
                className={fieldInputClass}
                value={form.email}
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="phone" className={fieldLabelClass}>
                Phone number
              </label>
              <div
                className={cn(
                  "flex overflow-hidden rounded-xl border border-slate-200 bg-white transition focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-500/20",
                  !form.country_code && "bg-slate-50",
                )}
              >
                {dialCode ? (
                  <span className="inline-flex shrink-0 items-center border-r border-slate-200 px-3 text-sm font-medium tabular-nums text-slate-900">
                    {dialCode}
                  </span>
                ) : null}
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  required
                  inputMode="tel"
                  autoComplete="tel-national"
                  disabled={!form.country_code}
                  placeholder={form.country_code ? "81234567890" : "Select country first"}
                  className="w-full bg-transparent px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed"
                  value={form.phone}
                  onChange={(e) => {
                    const next = e.target.value.replace(/[^\d\s()-]/g, "");
                    setForm((prev) => ({ ...prev, phone: next }));
                  }}
                />
              </div>
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="space-y-3">
            {INDUSTRIES.map((item) => (
              <SelectionCard
                key={item.id}
                title={item.label}
                description={item.description}
                selected={form.business_industry === item.id}
                onClick={() => setForm((prev) => ({ ...prev, business_industry: item.id }))}
              />
            ))}
          </div>
        ) : null}

        {step === 5 ? (
          <div className="space-y-3">
            {BRANCH_OPTIONS.map((option) => (
              <SelectionCard
                key={option.value}
                title={option.label}
                description={option.description}
                selected={form.branch_total === option.value}
                onClick={() => setForm((prev) => ({ ...prev, branch_total: option.value }))}
              />
            ))}
          </div>
        ) : null}

        {step === 6 ? (
          <AppointmentScheduler
            selectedDate={form.preferred_date}
            selectedTime={form.preferred_time}
            timeSlots={[...TIME_SLOTS]}
            onDateSelect={(preferred_date) =>
              setForm((prev) => ({
                ...prev,
                preferred_date,
                preferred_time:
                  prev.preferred_date === preferred_date ? prev.preferred_time : "",
              }))
            }
            onTimeSelect={(preferred_time) =>
              setForm((prev) => ({ ...prev, preferred_time }))
            }
          />
        ) : null}
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      ) : null}
    </DemoRequestLayout>
  );
}
