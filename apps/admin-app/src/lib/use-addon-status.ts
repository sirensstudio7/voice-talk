"use client";

import { useEffect, useState } from "react";

import { peekAddonStatus, rememberAddonStatus } from "@/lib/addon-status-cache";
import { api, type AddonStatus } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export function useAddonStatus(code: string) {
  const { token, business } = useAuth();
  const [status, setStatus] = useState<AddonStatus | null>(() =>
    business?.id ? peekAddonStatus(business.id, code) : null,
  );
  const [loading, setLoading] = useState(
    () => !(business?.id && peekAddonStatus(business.id, code)),
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !business?.id) return;

    const cached = peekAddonStatus(business.id, code);
    if (cached) {
      setStatus(cached);
      setLoading(false);
    } else {
      setStatus(null);
      setLoading(true);
    }

    let cancelled = false;
    void (async () => {
      try {
        const next = await api.getAddonStatus(token, business.id, code);
        if (cancelled) return;
        rememberAddonStatus(business.id, code, next);
        setStatus(next);
        setError(null);
      } catch (err) {
        if (!cancelled && !cached) {
          setError(err instanceof Error ? err.message : "Failed to load add-on");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, business?.id, code]);

  return {
    token,
    business,
    status,
    loading,
    error,
    setError,
    isActive: status?.subscription_status === "active",
    isPending: Boolean(status?.pending_request),
  };
}
