"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  OnboardingActions,
  OnboardingBackButton,
  OnboardingContinueButton,
  OnboardingLayout,
  SelectionCard,
} from "@/components/onboarding-shell";
import { ApiRequestError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  clearOnboardingDrafts,
  loadBusinessDraft,
  saveBusinessDraft,
} from "@/lib/onboarding";

const BUSINESS_TYPES = [
  { id: "restaurant", label: "Food & beverage", description: "Restaurants, cafés, coffee shops, bakeries, and bars" },
  { id: "retail", label: "Retail", description: "Products, inventory, and in-store purchases" },
  { id: "salon", label: "Salon & barber", description: "Hair, beauty, grooming, and appointment-based services" },
  { id: "clinic", label: "Healthcare", description: "Hospitals, clinics, dental, and medical practices" },
  { id: "other", label: "Other", description: "Any other type of business" },
] as const;

const USE_CASES = [
  {
    id: "orders",
    label: "Take orders",
    description: "Enable menu browsing, cart, and checkout for customers",
  },
  {
    id: "faqs",
    label: "Answer FAQs",
    description: "Focus on answering questions — menu and checkout will be hidden",
  },
  {
    id: "both",
    label: "Both",
    description: "Full AI cashier experience with orders and customer support",
  },
] as const;

const SALON_USE_CASES = [
  {
    id: "appointments",
    label: "Book appointments",
    description: "Treatment menu with slot booking for customers",
  },
  {
    id: "faqs",
    label: "Answer FAQs",
    description: "Focus on answering questions — menu and booking will be hidden",
  },
  {
    id: "both",
    label: "Both",
    description: "Full AI receptionist: book appointments and answer questions",
  },
] as const;

const LANGUAGES = [
  { id: "id", label: "Indonesian", description: "Your AI will speak primarily in Bahasa Indonesia" },
  { id: "en", label: "English", description: "Your AI will speak primarily in English" },
] as const;

const SUBSTEP_TO_ACTIVE_STEP = [2, 3, 4] as const;

export function BusinessOnboardingClient() {
  const router = useRouter();
  const { token, business, refreshBusinesses } = useAuth();
  const draft = loadBusinessDraft();

  const [substep, setSubstep] = useState(1);
  const [businessType, setBusinessType] = useState<string | undefined>(draft?.business_type);
  const [useCase, setUseCase] = useState<"orders" | "faqs" | "both" | "appointments" | undefined>(
    draft?.primary_use_case,
  );
  const [language, setLanguage] = useState<"id" | "en">(draft?.language ?? "id");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    saveBusinessDraft({
      business_type: businessType,
      primary_use_case: useCase,
      language,
    });
  }, [businessType, useCase, language]);

  const finish = async () => {
    if (!token || !business || !businessType || !useCase) return;

    setLoading(true);
    setError(null);
    try {
      await api.completeOnboarding(token, business.id, {
        business_type: businessType,
        primary_use_case: useCase,
        language,
      });
      await refreshBusinesses();
      clearOnboardingDrafts();
      router.push("/");
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : "Could not save your preferences. Try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = () => {
    if (substep < 3) {
      setSubstep((current) => current + 1);
      return;
    }
    void finish();
  };

  const canContinue =
    (substep === 1 && businessType !== undefined) ||
    (substep === 2 && useCase !== undefined) ||
    substep === 3;

  const stepContent = () => {
    if (substep === 1) {
      return (
        <div className="space-y-3">
          {BUSINESS_TYPES.map((item) => (
            <SelectionCard
              key={item.id}
              title={item.label}
              description={item.description}
              selected={businessType === item.id}
              onClick={() => setBusinessType(item.id)}
            />
          ))}
        </div>
      );
    }

    if (substep === 2) {
      const cases = businessType === "salon" ? SALON_USE_CASES : USE_CASES;
      return (
        <div className="space-y-3">
          {cases.map((item) => (
            <SelectionCard
              key={item.id}
              title={item.label}
              description={item.description}
              selected={useCase === item.id}
              onClick={() => setUseCase(item.id)}
            />
          ))}
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {LANGUAGES.map((item) => (
          <SelectionCard
            key={item.id}
            title={item.label}
            description={item.description}
            selected={language === item.id}
            onClick={() => setLanguage(item.id)}
          />
        ))}
      </div>
    );
  };

  const titles: Record<number, { title: string; subtitle: string }> = {
    1: {
      title: "What type of business do you run?",
      subtitle: "Choose business type",
    },
    2: {
      title: "What should your AI do first?",
      subtitle: "Choose primary use case",
    },
    3: {
      title: "What language should your AI speak?",
      subtitle: "Choose primary language",
    },
  };

  const handleBack = () => {
    if (substep === 1) {
      router.push("/onboarding/workspace");
      return;
    }
    setSubstep((current) => current - 1);
  };

  const { title, subtitle } = titles[substep];

  return (
    <OnboardingLayout
      activeStep={SUBSTEP_TO_ACTIVE_STEP[substep - 1]}
      title={title}
      subtitle={subtitle}
    >
      {stepContent()}

      {error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      ) : null}

      <OnboardingActions
        back={<OnboardingBackButton onClick={handleBack} disabled={loading} />}
      >
        <OnboardingContinueButton
          onClick={handleContinue}
          disabled={!canContinue}
          loading={loading && substep === 3}
        >
          {loading && substep === 3 ? "Saving…" : "Continue"}
        </OnboardingContinueButton>
      </OnboardingActions>
    </OnboardingLayout>
  );
}
