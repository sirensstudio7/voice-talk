"use client";

import { useEffect, useState } from "react";

import { useBusinessSlug } from "@/context/business-context";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function resolveQrUrl(path: string): string {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${API_URL}${path}`;
}

export function usePaymentQr() {
  const businessSlug = useBusinessSlug();
  const [paymentQrUrl, setPaymentQrUrl] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetchWithTimeout(
          `${API_URL}/businesses/${encodeURIComponent(businessSlug)}/payment`,
        );
        if (!response.ok) throw new Error("Payment QR unavailable.");
        const data = (await response.json()) as { payment_qr_url?: string };
        if (cancelled) return;
        setPaymentQrUrl(resolveQrUrl(data.payment_qr_url ?? ""));
      } catch {
        if (!cancelled) setPaymentQrUrl("");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [businessSlug]);

  return { paymentQrUrl, loading };
}
