import { OnboardingAuthGate } from "@/components/onboarding-auth-gate";

import { WorkspaceOnboardingClient } from "./workspace-onboarding-client";

export default function WorkspaceOnboardingPage() {
  return (
    <OnboardingAuthGate>
      <WorkspaceOnboardingClient />
    </OnboardingAuthGate>
  );
}
