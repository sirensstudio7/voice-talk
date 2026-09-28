"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { adminPath } from "@/lib/admin-path";
import { useAddonStatus } from "@/lib/use-addon-status";
import { useAuth } from "@/lib/auth";

type BookingFeatureGateProps = {
  children: React.ReactNode;
};

export function BookingFeatureGate({ children }: BookingFeatureGateProps) {
  const router = useRouter();
  const { business } = useAuth();
  const { isActive: bookingAddonActive, loading } = useAddonStatus("booking");
  const bookingEnabled = business?.capabilities?.booking_enabled ?? false;
  const allowed = bookingEnabled || bookingAddonActive;

  useEffect(() => {
    if (!business || loading) return;
    if (!allowed) {
      router.replace(adminPath(business.slug, "/"));
    }
  }, [business, allowed, loading, router]);

  if (!business || loading || !allowed) {
    return null;
  }

  return <>{children}</>;
}
