import { OnboardingAuthGate } from "@/components/onboarding-auth-gate";

import { BusinessOnboardingClient } from "./business-onboarding-client";

export default function BusinessOnboardingPage() {
  return (
    <OnboardingAuthGate requireBusiness>
      <BusinessOnboardingClient />
    </OnboardingAuthGate>
  );
}
