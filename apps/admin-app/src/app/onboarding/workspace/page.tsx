import { Suspense } from "react";

import { OnboardingAuthGate } from "@/components/onboarding-auth-gate";

import { WorkspaceOnboardingClient } from "./workspace-onboarding-client";

function OnboardingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-200 border-t-orange-500" />
    </div>
  );
}

export default function WorkspaceOnboardingPage() {
  return (
    <Suspense fallback={<OnboardingFallback />}>
      <OnboardingAuthGate>
        <WorkspaceOnboardingClient />
      </OnboardingAuthGate>
    </Suspense>
  );
}
