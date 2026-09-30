"use client";

import Image from "next/image";
import { useCallback, useEffect, useId, useRef, useState, type DragEvent } from "react";

import { PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { deferEffectRun } from "@/lib/defer-effect-run";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];
const ACCEPTED_IMAGE_EXTENSIONS = ".png,.jpg,.jpeg,.webp,.gif";

function resolveQrUrl(path: string): string {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${API_URL}${path}`;
}

function validateImageFile(file: File): string | null {
  const type = file.type.toLowerCase();
  if (type.startsWith("image/heic") || type.startsWith("image/heif")) {
    return "HEIC photos are not supported. Save or export the QR as PNG or JPG first.";
  }
  if (type && !ACCEPTED_IMAGE_TYPES.includes(type)) {
    return "Upload a PNG, JPG, WEBP, or GIF image for your payment QR code.";
  }
  if (file.size > 5 * 1024 * 1024) {
    return "QR image must be 5 MB or smaller.";
  }
  return null;
}

export function PaymentPageClient() {
  const { token, business } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputId = useId();
  const [paymentQrUrl, setPaymentQrUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !business) return;
    setLoading(true);
    setError(null);
    try {
      const settings = await api.getPaymentSettings(token, business.id);
      setPaymentQrUrl(settings.payment_qr_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load payment settings.");
    } finally {
      setLoading(false);
    }
  }, [token, business]);

  useEffect(() => {
    deferEffectRun(load);
  }, [load]);

  const handleUpload = async (file: File | null) => {
    if (!file) return;
    if (!token || !business) {
      setError("Your session expired. Refresh the page and sign in again.");
      return;
    }

    const validationError = validateImageFile(file);
    if (validationError) {
      setError(validationError);
      setMessage(null);
      return;
    }

    setUploading(true);
    setError(null);
    setMessage(null);

    try {
      const settings = await api.uploadPaymentQr(token, business.id, file);
      setPaymentQrUrl(settings.payment_qr_url);
      setMessage("Payment QR code uploaded.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemove = async () => {
    if (!token || !business) return;

    setUploading(true);
    setError(null);
    setMessage(null);

    try {
      await api.deletePaymentQr(token, business.id);
      setPaymentQrUrl("");
      setMessage("Payment QR code removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to remove QR code.");
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragActive(false);
    void handleUpload(event.dataTransfer.files?.[0] ?? null);
  };

  const previewUrl = resolveQrUrl(paymentQrUrl);

  return (
    <>
      <PageHeader
        title="Payment QR"
        subtitle="Upload the QR code customers scan to pay at checkout."
      />

      <div className="max-w-2xl space-y-6">
        {loading ? (
          <p className="text-sm text-slate-500">Loading payment settings…</p>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
              <label
                htmlFor={uploading ? undefined : fileInputId}
                className={cn(
                  "flex h-52 w-52 shrink-0 cursor-pointer items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 transition",
                  dragActive && "border-orange-400 bg-orange-50",
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
                onDrop={handleDrop}
              >
                {previewUrl ? (
                  <Image
                    src={previewUrl}
                    alt="Payment QR code"
                    width={208}
                    height={208}
                    unoptimized
                    className="h-full w-full rounded-2xl object-contain p-3"
                  />
                ) : (
                  <div className="px-4 text-center">
                    <p className="text-sm font-semibold text-slate-700">No QR uploaded</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Click or drop your PayNow, DuitNow, or other payment QR image here.
                    </p>
                  </div>
                )}
              </label>

              <div className="flex-1 space-y-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Upload QR code</p>
                  <p className="mt-1 text-sm text-slate-500">
                    PNG, JPG, WEBP, or GIF up to 5 MB. This QR will be shown to customers when
                    they pay.
                  </p>
                </div>

                <input
                  id={fileInputId}
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_IMAGE_EXTENSIONS}
                  disabled={uploading}
                  className="sr-only"
                  onChange={(event) => {
                    void handleUpload(event.target.files?.[0] ?? null);
                  }}
                />

                <div className="flex flex-wrap gap-3">
                  <label
                    htmlFor={uploading ? undefined : fileInputId}
                    className={cn(
                      "inline-flex cursor-pointer rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600",
                      uploading && "pointer-events-none cursor-not-allowed opacity-60",
                    )}
                  >
                    {uploading ? "Uploading…" : previewUrl ? "Replace QR" : "Upload QR"}
                  </label>

                  {previewUrl ? (
                    <button
                      type="button"
                      disabled={uploading}
                      onClick={() => {
                        void handleRemove();
                      }}
                      className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>

                {message ? (
                  <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p>
                ) : null}
                {error ? (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
