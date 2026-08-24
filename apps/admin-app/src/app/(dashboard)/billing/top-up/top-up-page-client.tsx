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
import { useEffect, useId, useRef, useState } from "react";

import { PageHeader } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { api, type TopupPackage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";

function formatIdr(amount: number) {
  return `Rp${amount.toLocaleString("id-ID")}`;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const PAYMENT_METHODS = [
  { id: "bank_transfer", label: "Bank transfer", icon: BuildingLibraryIcon },
  { id: "qris", label: "QRIS", icon: QrCodeIcon },
  { id: "card", label: "Card", icon: CreditCardIcon },
] as const;

const BANK_ACCOUNTS = [
  { bank: "BCA", accountName: "PT Lorescale Indonesia", accountNumber: "0888123456" },
  { bank: "Mandiri", accountName: "PT Lorescale Indonesia", accountNumber: "1300012345678" },
] as const;

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

export function TopUpPageClient() {
  const { token } = useAuth();
  const router = useRouter();
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [packages, setPackages] = useState<TopupPackage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [method, setMethod] = useState("bank_transfer");
  const [proofUrl, setProofUrl] = useState("");
  const [proofName, setProofName] = useState("");
  const [proofSize, setProofSize] = useState(0);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    void api.listTopupPackages(token).then((data) => {
      setPackages(data.items);
      const popular = data.items.find((item) => item.is_popular) ?? data.items[0];
      if (popular) setSelectedId(popular.id);
    });
  }, [token]);

  useEffect(() => {
    return () => {
      if (proofPreview) URL.revokeObjectURL(proofPreview);
    };
  }, [proofPreview]);

  const selected = packages.find((item) => item.id === selectedId) ?? null;

  const clearProof = () => {
    if (proofPreview) URL.revokeObjectURL(proofPreview);
    setProofPreview(null);
    setProofUrl("");
    setProofName("");
    setProofSize(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const uploadProof = async (file: File | null) => {
    if (!token || !file) return;
    if (!file.type.startsWith("image/")) {
      setError("Upload a PNG, JPG, WEBP, or GIF image of your payment proof.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Payment proof must be 5 MB or smaller.");
      return;
    }

    if (proofPreview) URL.revokeObjectURL(proofPreview);
    const preview = URL.createObjectURL(file);
    setProofPreview(preview);
    setProofName(file.name);
    setProofSize(file.size);
    setUploading(true);
    setError(null);
    try {
      const uploaded = await api.uploadTopupPaymentProof(token, file);
      setProofUrl(uploaded.url);
    } catch (err) {
      URL.revokeObjectURL(preview);
      setProofPreview(null);
      setProofUrl("");
      setProofName("");
      setProofSize(0);
      setError(err instanceof Error ? err.message : "Unable to upload proof.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const submit = async () => {
    if (!token || !selected) return;
    if (!proofUrl) {
      setError("Upload a payment proof before submitting.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.createTopupOrder(token, {
        package_id: selected.id,
        payment_method: method,
        payment_proof_url: proofUrl,
      });
      router.push("/transactions");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit top-up.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-16">
      <PageHeader
        title="Add Lore Voice Minutes"
        subtitle="Buy extra minutes for this account. They expire 90 days after payment is confirmed."
      />
      <p>
        <Link href="/billing" className="text-sm text-orange-600 hover:underline">
          ← Back to billing
        </Link>
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {packages.map((pkg) => {
          const active = pkg.id === selectedId;
          return (
            <button
              key={pkg.id}
              type="button"
              onClick={() => setSelectedId(pkg.id)}
              className={`rounded-2xl border p-4 text-left ${
                active ? "border-orange-400 bg-orange-50 ring-2 ring-orange-500/20" : "border-slate-200 bg-white"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">{pkg.name}</p>
                {pkg.is_popular ? (
                  <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-700">
                    Popular
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-xl font-semibold text-slate-900">{pkg.minutes.toLocaleString()} min</p>
              {pkg.discount_percent ? (
                <p className="mt-1 text-sm text-slate-600">
                  <span className="mr-2 text-slate-400 line-through">
                    {formatIdr(pkg.list_price_idr ?? pkg.price_idr)}
                  </span>
                  {formatIdr(pkg.price_idr)}
                  <span className="ml-1.5 text-xs font-medium text-orange-600">
                    −{pkg.discount_percent}%
                  </span>
                </p>
              ) : (
                <p className="mt-1 text-sm text-slate-600">{formatIdr(pkg.price_idr)}</p>
              )}
              <p className="mt-1 text-xs text-slate-500">Valid {pkg.expires_after_days} days after credit</p>
            </button>
          );
        })}
      </div>

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
        <p className="text-sm font-semibold text-slate-900">Payment method</p>
        <div className="grid gap-2">
          {PAYMENT_METHODS.map((option) => {
            const active = method === option.id;
            const Icon = option.icon;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setMethod(option.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left text-sm transition",
                  active ? "border-orange-300 bg-orange-50" : "border-slate-200 bg-white hover:border-slate-300",
                )}
              >
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full",
                    active ? "bg-orange-100 text-orange-600" : "bg-slate-50 text-slate-500",
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="font-medium text-slate-800">{option.label}</span>
              </button>
            );
          })}
        </div>

        {method === "bank_transfer" ? (
          <div className="space-y-2">
            {BANK_ACCOUNTS.map((account) => (
              <div
                key={account.accountNumber}
                className="space-y-2.5 rounded-xl bg-slate-50 px-3.5 py-3 ring-1 ring-slate-200/80"
              >
                <p className="text-sm font-semibold text-slate-900">{account.bank}</p>
                <CopyField label="Account name" value={account.accountName} />
                <CopyField label="Account number" value={account.accountNumber} />
              </div>
            ))}
            <p className="text-xs leading-relaxed text-slate-500">
              Transfer the exact amount. Minutes are added after we confirm payment.
            </p>
          </div>
        ) : (
          <p className="text-xs leading-relaxed text-slate-500">
            Complete payment, then upload a screenshot below. Minutes are added after we confirm
            payment.
          </p>
        )}

        <div className="space-y-2 border-t border-slate-100 pt-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Payment proof</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Transfer receipt or QRIS success screenshot.
            </p>
          </div>

          <input
            id={fileInputId}
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="sr-only"
            disabled={uploading}
            onChange={(event) => {
              void uploadProof(event.target.files?.[0] ?? null);
            }}
          />

          {proofPreview ? (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={proofPreview}
                alt="Payment proof preview"
                className="max-h-56 w-full bg-slate-100 object-contain"
              />
              <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">
                    {proofName || "Payment proof"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {uploading
                      ? "Uploading…"
                      : proofSize
                        ? `${formatFileSize(proofSize)} · Ready to submit`
                        : "Ready to submit"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <label
                    htmlFor={uploading ? undefined : fileInputId}
                    className={cn(
                      "cursor-pointer rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50",
                      uploading && "pointer-events-none opacity-50",
                    )}
                  >
                    Replace
                  </label>
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={clearProof}
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <XMarkIcon className="size-3.5" aria-hidden />
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <label
              htmlFor={uploading ? undefined : fileInputId}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-5 py-8 text-center transition",
                dragActive
                  ? "border-orange-400 bg-orange-50"
                  : "border-slate-300 bg-slate-50 hover:border-orange-300 hover:bg-orange-50/40",
                uploading && "pointer-events-none opacity-60",
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
                void uploadProof(event.dataTransfer.files?.[0] ?? null);
              }}
            >
              <span className="flex size-12 items-center justify-center rounded-full bg-white text-orange-600 shadow-sm ring-1 ring-orange-100">
                <ArrowUpTrayIcon className="size-5" aria-hidden />
              </span>
              <span className="mt-3 text-sm font-semibold text-slate-800">Drop receipt here</span>
              <span className="mt-1 text-xs text-slate-500">PNG, JPG, WEBP or GIF · max 5 MB</span>
              <span className="mt-4 inline-flex rounded-lg bg-orange-500 px-4 py-2 text-xs font-semibold text-white shadow-sm">
                Choose file
              </span>
            </label>
          )}
        </div>
      </section>

      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      <Button
        type="button"
        disabled={!selected || saving || uploading || !proofUrl}
        onClick={() => {
          void submit();
        }}
      >
        {saving ? "Submitting…" : selected ? `Pay ${formatIdr(selected.price_idr)}` : "Select a package"}
      </Button>
    </div>
  );
}
