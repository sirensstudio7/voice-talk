"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useAuth } from "@/lib/auth";

type MenuFeatureGateProps = {
  children: React.ReactNode;
};

export function MenuFeatureGate({ children }: MenuFeatureGateProps) {
  const router = useRouter();
  const { business } = useAuth();
  const orderingEnabled = business?.capabilities?.ordering_enabled ?? true;
  const menuEnabled = business?.capabilities?.menu_enabled ?? orderingEnabled;

  useEffect(() => {
    if (!business) return;
    if (!menuEnabled) {
      router.replace("/");
    }
  }, [business, menuEnabled, router]);

  if (!business || !menuEnabled) {
    return null;
  }

  return <>{children}</>;
}
