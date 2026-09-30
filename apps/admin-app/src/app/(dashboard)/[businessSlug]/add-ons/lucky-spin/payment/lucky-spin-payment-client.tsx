"use client";

import {
  ArrowUpTrayIcon,
  BuildingLibraryIcon,
  CheckIcon,
  ClipboardDocumentIcon,
  CreditCardIcon,
  QrCodeIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { api } from "@/lib/api";
import { adminPath } from "@/lib/admin-path";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";

const FALLBACK_MONTHLY_IDR = 199_000;

const DURATIONS = [
  { months: 1, label: "1 month", discount: 0 },
  { months: 3, label: "3 months", discount: 0.05 },
  { months: 6, label: "6 months", discount: 0.1 },
  { months: 12, label: "12 months", discount: 0.15, badge: "Best value" },
] as const;

const PAYMENT_METHODS = [
  {
    id: "bank_transfer",
    label: "Bank transfer",
    description: "Transfer to LORESCALE account. Activation after confirmation.",
    icon: BuildingLibraryIcon,
  },
  {
    id: "qris",
    label: "QRIS",
    description: "Pay via QRIS and send proof to support.",
    icon: QrCodeIcon,
  },
  {
    id: "card",
    label: "Card",
    description: "Credit / debit card — processed offline for now.",
    icon: CreditCardIcon,
  },
] as const;

const BANK_ACCOUNTS = [
  {
    id: "bca",
    bank: "BCA",
    accountName: "PT Lorescale Indonesia",
    accountNumber: "0888123456",
  },
  {
    id: "mandiri",
    bank: "Bank Mandiri",
    accountName: "PT Lorescale Indonesia",
    accountNumber: "1300012345678",
  },
] as const;

function BcaLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <rect width="48" height="48" rx="10" fill="#005AAF" />
      <text
        x="24"
        y="30"
        textAnchor="middle"
        fill="#fff"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontSize="14"
        fontWeight="700"
        letterSpacing="-0.5"
      >
        BCA
      </text>
    </svg>
  );
}

function MandiriLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <rect width="48" height="48" rx="10" fill="#003D79" />
      <circle cx="24" cy="18" r="7" fill="#FDB913" />
      <path
        d="M12 34c3.5-5 8-7.5 12-7.5S32.5 29 36 34"
        fill="none"
        stroke="#FDB913"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function BankLogo({ id, className }: { id: (typeof BANK_ACCOUNTS)[number]["id"]; className?: string }) {
  if (id === "bca") return <BcaLogo className={className} />;
  return <MandiriLogo className={className} />;
}

function formatIdr(amount: number) {
  return `Rp${amount.toLocaleString("id-ID")}`;
}

function priceForMonths(monthlyIdr: number, months: number, discount: number) {
  const gross = monthlyIdr * months;
  return Math.round(gross * (1 - discount));
}

function createTransactionCode() {
  const part = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  return `LSP-${part}`;
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
        <p className="mt-0.5 truncate font-medium text-slate-900">{value}</p>
      </div>
      <button
        type="button"
        onClick={() => void copy()}
        className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
      >
        {copied ? (
          <>
            <CheckIcon className="size-3.5 text-emerald-600" aria-hidden />
            Copied
          </>
        ) : (
          <>
            <ClipboardDocumentIcon className="size-3.5" aria-hidden />
            Copy
          </>
        )}
      </button>
    </div>
  );
}

export function LuckySpinPaymentClient() {
  const router = useRouter();
  const { token, business, user } = useAuth();
  const { state: sidebarState, isMobile } = useSidebar();
  const [durationMonths, setDurationMonths] = useState<number>(12);
  const [paymentMethod, setPaymentMethod] = useState<string>("bank_transfer");
  const [billingName, setBillingName] = useState("");
  const [billingEmail, setBillingEmail] = useState("");
  const [billingPhone, setBillingPhone] = useState("");
  const [company, setCompany] = useState("");
  const [notes, setNotes] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<"active" | "pending" | null>(null);
  const [checking, setChecking] = useState(true);
  const [monthlyIdr, setMonthlyIdr] = useState(FALLBACK_MONTHLY_IDR);
  const [durationOff, setDurationOff] = useState({ 3: 0.05, 6: 0.1, 12: 0.15 });
  const [transactionCode] = useState(() => createTransactionCode());

  const discountFor = useCallback((months: number) => {
    if (months === 3) return durationOff[3];
    if (months === 6) return durationOff[6];
    if (months === 12) return durationOff[12];
    return 0;
  }, [durationOff]);

  const needsProof = paymentMethod === "bank_transfer" || paymentMethod === "qris";

  useEffect(() => {
    if (user?.name) setBillingName((prev) => prev || user.name);
    if (user?.email) setBillingEmail((prev) => prev || user.email);
    if (business?.name) setCompany((prev) => prev || business.name);
  }, [user?.name, user?.email, business?.name]);

  useEffect(() => {
    return () => {
      if (proofPreview) URL.revokeObjectURL(proofPreview);
    };
  }, [proofPreview]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!token || !business?.id) return;
      setChecking(true);
      try {
        const status = await api.getAddonStatus(token, business.id, "lucky_spin");
        if (cancelled) return;
        if (status.addon.monthly_price_idr) setMonthlyIdr(status.addon.monthly_price_idr);
        setDurationOff({
          3: (status.addon.discount_3m_percent ?? 5) / 100,
          6: (status.addon.discount_6m_percent ?? 10) / 100,
          12: (status.addon.discount_12m_percent ?? 15) / 100,
        });
        if (status.subscription_status === "active") setBlocked("active");
        else if (status.pending_request) setBlocked("pending");
        else setBlocked(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load status");
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, business?.id]);

  const selectedDuration = DURATIONS.find((d) => d.months === durationMonths) ?? DURATIONS[3];
  const total = useMemo(
    () => priceForMonths(monthlyIdr, selectedDuration.months, discountFor(selectedDuration.months)),
    [monthlyIdr, selectedDuration, discountFor],
  );
  const monthlyEquivalent = Math.round(total / selectedDuration.months);

  const canSubmit =
    !checking &&
    !blocked &&
    !submitting &&
    billingName.trim().length > 1 &&
    billingEmail.trim().includes("@") &&
    Boolean(paymentMethod) &&
    (!needsProof || Boolean(proofFile));

  function setProof(file: File | null) {
    if (proofPreview) URL.revokeObjectURL(proofPreview);
    if (!file) {
      setProofFile(null);
      setProofPreview(null);
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("Upload a PNG, JPG, WEBP, or GIF image of your payment proof.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Payment proof must be 5 MB or smaller.");
      return;
    }
    setError(null);
    setProofFile(file);
    setProofPreview(URL.createObjectURL(file));
  }

  const footerStyle = {
    left: isMobile
      ? "0px"
      : sidebarState === "collapsed"
        ? "var(--sidebar-width-icon)"
        : "var(--sidebar-width)",
  } as const;

  async function submit() {
    if (!token || !business?.id || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      let paymentProofUrl: string | undefined;
      if (needsProof && proofFile) {
        const uploaded = await api.uploadAddonPaymentProof(token, business.id, proofFile);
        paymentProofUrl = uploaded.url;
      }
      await api.requestAddon(token, business.id, "lucky_spin", {
        duration_months: durationMonths,
        payment_method: paymentMethod,
        billing_name: billingName.trim(),
        billing_email: billingEmail.trim(),
        billing_phone: billingPhone.trim() || undefined,
        company: company.trim() || undefined,
        notes: notes.trim() || undefined,
        payment_proof_url: paymentProofUrl,
        transaction_code: transactionCode,
        amount_idr: total,
        amount_display: formatIdr(total),
      });
      router.push("/transactions");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit payment request");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="mx-auto max-w-2xl space-y-8 pb-28">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Checkout</h1>
          <p className="mt-1 text-sm text-slate-500">
            Lucky Spin · choose duration and payment details
          </p>
        </div>

        {error ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {blocked === "active" ? (
          <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-700">
            This add-on is already active for this workspace.
          </p>
        ) : null}
        {blocked === "pending" ? (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-800">
            A payment request is already pending. A superadmin will activate it after confirmation.
          </p>
        ) : null}

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-900">Duration</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {DURATIONS.map((option) => {
              const amount = priceForMonths(monthlyIdr, option.months, discountFor(option.months));
              const selected = durationMonths === option.months;
              return (
                <button
                  key={option.months}
                  type="button"
                  disabled={Boolean(blocked)}
                  onClick={() => setDurationMonths(option.months)}
                  className={cn(
                    "relative rounded-2xl border px-4 py-3 text-left transition",
                    selected
                      ? "border-blue-400 bg-blue-50/60 ring-1 ring-blue-300"
                      : "border-slate-200 bg-white hover:border-slate-300",
                    blocked && "opacity-60",
                  )}
                >
                  {"badge" in option && option.badge ? (
                    <span className="absolute right-3 top-3 rounded-full bg-blue-500 px-2 py-0.5 text-[10px] font-medium text-white">
                      {option.badge}
                    </span>
                  ) : null}
                  <p className="text-sm font-semibold text-slate-900">{option.label}</p>
                  <p className="mt-1 text-lg font-semibold tracking-tight text-slate-900">
                    {formatIdr(amount)}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {formatIdr(Math.round(amount / option.months))}/mo
                    {discountFor(option.months) > 0
                      ? ` · save ${Math.round(discountFor(option.months) * 100)}%`
                      : null}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-900">Payment details</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2">
              <span className="text-slate-500">Full name</span>
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                value={billingName}
                disabled={Boolean(blocked)}
                onChange={(e) => setBillingName(e.target.value)}
                autoComplete="name"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-500">Email</span>
              <input
                type="email"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                value={billingEmail}
                disabled={Boolean(blocked)}
                onChange={(e) => setBillingEmail(e.target.value)}
                autoComplete="email"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-500">Phone</span>
              <input
                type="tel"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                value={billingPhone}
                disabled={Boolean(blocked)}
                onChange={(e) => setBillingPhone(e.target.value)}
                autoComplete="tel"
                placeholder="Optional"
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="text-slate-500">Company / workspace</span>
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                value={company}
                disabled={Boolean(blocked)}
                onChange={(e) => setCompany(e.target.value)}
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="text-slate-500">Note</span>
              <textarea
                rows={2}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                value={notes}
                disabled={Boolean(blocked)}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional — invoice number, transfer reference…"
              />
            </label>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-900">Payment method</h2>
          <div className="space-y-2">
            {PAYMENT_METHODS.map(({ id, label, description, icon: Icon }) => {
              const selected = paymentMethod === id;
              return (
                <button
                  key={id}
                  type="button"
                  disabled={Boolean(blocked)}
                  onClick={() => setPaymentMethod(id)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition",
                    selected
                      ? "border-blue-400 bg-blue-50/60 ring-1 ring-blue-300"
                      : "border-slate-200 bg-white hover:border-slate-300",
                    blocked && "opacity-60",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full",
                      selected ? "bg-blue-100 text-blue-600" : "bg-slate-50 text-slate-600",
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-900">{label}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">
                      {description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {paymentMethod === "bank_transfer" ? (
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Transfer details</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Transfer the exact amount, then submit this request.
                  </p>
                </div>
                <p className="text-sm font-semibold text-blue-600">{formatIdr(total)}</p>
              </div>

              <div className="rounded-xl bg-blue-50 px-3.5 py-3 ring-1 ring-blue-100">
                <CopyField label="Transaction code" value={transactionCode} />
                <p className="mt-2 text-xs text-blue-700/80">
                  Put this code in your bank transfer note so we can match payment faster.
                </p>
              </div>

              {BANK_ACCOUNTS.map((account) => (
                <div
                  key={account.id}
                  className="space-y-2.5 rounded-xl bg-slate-50 px-3.5 py-3 ring-1 ring-slate-200/80"
                >
                  <div className="flex items-center gap-3">
                    <BankLogo id={account.id} className="size-10 shrink-0" />
                    <p className="text-sm font-semibold text-slate-900">{account.bank}</p>
                  </div>
                  <CopyField label="Account name" value={account.accountName} />
                  <CopyField label="Account number" value={account.accountNumber} />
                </div>
              ))}

              <p className="text-xs leading-relaxed text-slate-500">
                Use your workspace or company name as the transfer note so we can match payment
                faster.
              </p>
            </div>
          ) : null}

          {paymentMethod === "qris" ? (
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-semibold text-slate-900">Pay with QRIS</p>
              <p className="text-xs leading-relaxed text-slate-500">
                Complete payment via QRIS for {formatIdr(total)}, then upload your payment
                screenshot below.
              </p>
              <div className="rounded-xl bg-blue-50 px-3.5 py-3 ring-1 ring-blue-100">
                <CopyField label="Transaction code" value={transactionCode} />
              </div>
            </div>
          ) : null}
        </section>

        {needsProof ? (
          <section className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Upload payment proof</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Required — transfer receipt or QRIS success screenshot (PNG, JPG, up to 5 MB).
              </p>
            </div>

            {proofPreview ? (
              <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={proofPreview}
                  alt="Payment proof preview"
                  className="max-h-64 w-full object-contain bg-slate-50"
                />
                <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
                  <p className="truncate text-sm text-slate-600">{proofFile?.name}</p>
                  <button
                    type="button"
                    disabled={Boolean(blocked)}
                    onClick={() => setProof(null)}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    <XMarkIcon className="size-3.5" aria-hidden />
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <label
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-4 py-10 text-center transition",
                  dragActive
                    ? "border-blue-400 bg-blue-50/50"
                    : "border-slate-300 bg-white hover:border-slate-400",
                  blocked && "pointer-events-none opacity-60",
                )}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setDragActive(true);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  setDragActive(false);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragActive(false);
                  setProof(event.dataTransfer.files?.[0] ?? null);
                }}
              >
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="sr-only"
                  disabled={Boolean(blocked)}
                  onChange={(event) => setProof(event.target.files?.[0] ?? null)}
                />
                <span className="flex size-10 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                  <ArrowUpTrayIcon className="size-5" aria-hidden />
                </span>
                <p className="mt-3 text-sm font-semibold text-slate-800">
                  Drop proof here or click to upload
                </p>
                <p className="mt-1 text-xs text-slate-500">Bank transfer receipt or QRIS screenshot</p>
              </label>
            )}
          </section>
        ) : null}

        <section className="rounded-2xl bg-slate-50 px-4 py-4 ring-1 ring-slate-200/80">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">Subtotal</span>
            <span className="font-medium text-slate-900">{formatIdr(total)}</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-slate-500">Equivalent</span>
            <span className="text-slate-600">{formatIdr(monthlyEquivalent)}/mo</span>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3">
            <span className="text-sm font-semibold text-slate-900">Total due</span>
            <span className="text-xl font-semibold tracking-tight text-slate-900">
              {formatIdr(total)}
            </span>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            Submitting creates a payment request. A superadmin will activate Lucky Spin after
            payment is confirmed.
          </p>
        </section>
      </div>

      <footer
        style={footerStyle}
        className="fixed bottom-0 right-0 z-20 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
      >
        <div className="flex w-full items-center justify-between gap-3 px-4 py-3 lg:px-6">
          <Button type="button" variant="outline" asChild>
            <Link href={adminPath(business?.slug ?? "", "/add-ons/lucky-spin")}>Back</Link>
          </Button>
          <Button type="button" disabled={!canSubmit} onClick={() => void submit()}>
            {submitting ? "Submitting…" : `Pay ${formatIdr(total)}`}
          </Button>
        </div>
      </footer>
    </>
  );
}
