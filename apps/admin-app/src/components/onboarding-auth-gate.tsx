"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { adminPath } from "@/lib/admin-path";
import { useAuth } from "@/lib/auth";
import { isOnboardingComplete } from "@/lib/onboarding";

export function OnboardingAuthGate({
  children,
  requireBusiness = false,
}: {
  children: React.ReactNode;
  requireBusiness?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isNewWorkspace = searchParams.get("new") === "1";
  const { token, businesses, business, businessesLoading, authReady } = useAuth();

  useEffect(() => {
    if (!authReady) return;
    if (!token) {
      router.replace("/login");
      return;
    }
    if (businessesLoading) return;

    const home =
      business?.slug || businesses[0]?.slug
        ? adminPath(business?.slug ?? businesses[0]!.slug, "/")
        : "/workspaces";

    if (!requireBusiness) {
      if (!isNewWorkspace && businesses.length > 0 && isOnboardingComplete(business)) {
        router.replace(home);
      }
      return;
    }

    if (businesses.length === 0) {
      router.replace("/onboarding/workspace");
      return;
    }

    if (isOnboardingComplete(business)) {
      router.replace(home);
    }
  }, [authReady, token, businesses, business, businessesLoading, requireBusiness, isNewWorkspace, router]);

  if (!authReady || !token || businessesLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-200 border-t-orange-500" />
      </div>
    );
  }

  if (!requireBusiness) {
    if (!isNewWorkspace && businesses.length > 0 && isOnboardingComplete(business)) {
      return null;
    }
    return <>{children}</>;
  }

  if (businesses.length === 0 || !business || isOnboardingComplete(business)) {
    return null;
  }

  return <>{children}</>;
}
