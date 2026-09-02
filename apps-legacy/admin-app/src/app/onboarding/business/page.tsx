import { Suspense } from "react";

import { OnboardingAuthGate } from "@/components/onboarding-auth-gate";

import { BusinessOnboardingClient } from "./business-onboarding-client";

function OnboardingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-200 border-t-orange-500" />
    </div>
  );
}

export default function BusinessOnboardingPage() {
  return (
    <Suspense fallback={<OnboardingFallback />}>
      <OnboardingAuthGate requireBusiness>
        <BusinessOnboardingClient />
      </OnboardingAuthGate>
    </Suspense>
  );
}
