"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useAuth } from "@/lib/auth";

type BookingFeatureGateProps = {
  children: React.ReactNode;
};

export function BookingFeatureGate({ children }: BookingFeatureGateProps) {
  const router = useRouter();
  const { business } = useAuth();
  const bookingEnabled = business?.capabilities?.booking_enabled ?? false;

  useEffect(() => {
    if (!business) return;
    if (!bookingEnabled) {
      router.replace("/");
    }
  }, [business, bookingEnabled, router]);

  if (!business || !bookingEnabled) {
    return null;
  }

  return <>{children}</>;
}
