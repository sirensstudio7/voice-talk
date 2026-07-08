"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { DashboardShell } from "@/components/dashboard-shell";
import { useAuth } from "@/lib/auth";
import { getOnboardingRedirectPath } from "@/lib/onboarding";

export function DashboardAuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { token, businesses, business, businessesLoading, authReady } = useAuth();

  useEffect(() => {
    if (!authReady) return;
    if (!token) {
      router.replace("/login");
      return;
    }
    if (businessesLoading) return;

    const onboardingPath = getOnboardingRedirectPath(businesses, business);
    if (onboardingPath) {
      router.replace(onboardingPath);
    }
  }, [authReady, token, businesses, business, businessesLoading, router]);

  if (!authReady || !token || businessesLoading || businesses.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-200 border-t-orange-500" />
      </div>
    );
  }

  if (getOnboardingRedirectPath(businesses, business)) {
    return null;
  }

  return <DashboardShell>{children}</DashboardShell>;
}
