"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { adminPath } from "@/lib/admin-path";
import { useAuth } from "@/lib/auth";

type OrderingFeatureGateProps = {
  children: React.ReactNode;
};

export function OrderingFeatureGate({ children }: OrderingFeatureGateProps) {
  const router = useRouter();
  const { business } = useAuth();
  const orderingEnabled = business?.capabilities?.ordering_enabled ?? true;

  useEffect(() => {
    if (!business) return;
    if (!orderingEnabled) {
      router.replace(adminPath(business.slug, "/"));
    }
  }, [business, orderingEnabled, router]);

  if (!business || !orderingEnabled) {
    return null;
  }

  return <>{children}</>;
}
