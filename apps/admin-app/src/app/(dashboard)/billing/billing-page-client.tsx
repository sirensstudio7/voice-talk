"use client";

import { SparklesIcon } from "@heroicons/react/24/outline";
import { useEffect, useMemo, useState } from "react";

import {
  PricingBadge,
  PricingBody,
  PricingCard,
  PricingDescription,
  PricingHeader,
  PricingList,
  PricingListItem,
  PricingMainPrice,
  PricingPeriod,
  PricingPlan,
  PricingPlanName,
  PricingPrice,
  PricingPricePrefix,
  PricingSeparator,
} from "@/components/pricing-card";
import { VoiceMinutesCard } from "@/components/voice-minutes-card";
import { PageHeader } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { api, type AccountSubscription, type SubscriptionPlan } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { detectCountryCode, isIndonesiaCountry } from "@/lib/country";
import { deferEffectRun } from "@/lib/defer-effect-run";

function CircleCheckIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
type PlanDetails = {
  tagline: string;
  badge?: string;
  pricePrefix: string;
  usd: { monthly: string; yearly: string };
  idr: { monthly: string; yearly: string };
  features: (plan: SubscriptionPlan) => string[];
  includedLabel?: string;
};

/** Split "Rp2.249.000" / "$149" into currency label + amount for cleaner layout. */
function formatIdr(amount: number) {
  return `Rp${amount.toLocaleString("id-ID")}`;
}

function splitPrice(price: string): { currency: string; amount: string } {
  if (price.startsWith("Rp")) {
    return { currency: "Rp", amount: price.slice(2).trim() };
  }
  if (price.startsWith("$")) {
    return { currency: "$", amount: price.slice(1).trim() };
  }
  return { currency: "", amount: price };
}

const PLAN_DETAILS: Record<string, PlanDetails> = {
  starter: {
    tagline: "Best for individual shops, solo operators, and testing production setups",
    pricePrefix: "Starts at",
    usd: { monthly: "$49", yearly: "$470" },
    idr: { monthly: "Rp749.000", yearly: "Rp7.490.000" },
    features: (plan) => [
      `${plan.workspace_limit} workspace${plan.workspace_limit === 1 ? "" : "s"}`,
      `${plan.kiosk_display_limit ?? 1} kiosk display${(plan.kiosk_display_limit ?? 1) === 1 ? "" : "s"}`,
      `${plan.monthly_voice_minutes ?? 300} Lore Voice Minutes / month`,
      "1 active AI Voice Talk agent",
      "Basic dashboard & analytics",
      "Email support",
    ],
  },
  growth: {
    tagline: "Best for growing teams, multi-branch brands, and scaling operations",
    badge: "Popular",
    pricePrefix: "Best value",
    usd: { monthly: "$149", yearly: "$1,430" },
    idr: { monthly: "Rp2.249.000", yearly: "Rp22.490.000" },
    includedLabel: "Everything in Starter, plus",
    features: (plan) => [
      `${plan.workspace_limit} workspace${plan.workspace_limit === 1 ? "" : "s"}`,
      `${plan.kiosk_display_limit ?? 5} kiosk display${(plan.kiosk_display_limit ?? 5) === 1 ? "" : "s"}`,
      `${plan.monthly_voice_minutes ?? 1500} Lore Voice Minutes / month`,
      "Up to 5 voice agents",
      "WhatsApp integration",
      "Advanced analytics",
      "Priority support",
    ],
  },
  enterprise: {
    tagline:
      "Best for hospitals, universities, government, and large organizations",
    badge: "Custom",
    pricePrefix: "Starting from",
    usd: { monthly: "$375", yearly: "$3,750" },
    idr: { monthly: "Rp5.000.000", yearly: "Rp60.000.000" },
    includedLabel: "Sales-led package includes",
    features: (plan) => [
      `${plan.workspace_limit} workspaces included`,
      `${plan.kiosk_display_limit ?? 10} kiosk displays`,
      `${plan.monthly_voice_minutes ?? 5000} Lore Voice Minutes / month`,
      "Custom onboarding",
      "Dedicated support",
      "SLA",
      "Training session",
      "Custom integrations",
    ],
  },
};

function BillingCycleToggle({
  yearly,
  onChange,
  savePercent,
}: {
  yearly: boolean;
  onChange: (yearly: boolean) => void;
  savePercent: number;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        role="group"
        aria-label="Billing cycle"
        className="relative inline-grid grid-cols-2 rounded-full border border-border bg-muted/70 p-1"
      >
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-foreground shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
            yearly && "translate-x-full",
          )}
        />
        <button
          type="button"
          onClick={() => onChange(false)}
          aria-pressed={!yearly}
          className={cn(
            "relative z-10 min-w-[7.25rem] rounded-full px-5 py-2 text-sm font-medium transition-colors",
            !yearly ? "text-background" : "text-muted-foreground hover:text-foreground/80",
          )}
        >
          Monthly
        </button>
        <button
          type="button"
          onClick={() => onChange(true)}
          aria-pressed={yearly}
          className={cn(
            "relative z-10 min-w-[7.25rem] rounded-full px-5 py-2 text-sm font-medium transition-colors",
            yearly ? "text-background" : "text-muted-foreground hover:text-foreground/80",
          )}
        >
          Yearly
        </button>
      </div>
      <p
        className={cn(
          "text-xs font-medium transition-all duration-200",
          yearly
            ? "translate-y-0 text-emerald-600 opacity-100 dark:text-emerald-400"
            : "pointer-events-none -translate-y-1 opacity-0",
        )}
      >
        {savePercent > 0 ? `Save ${savePercent}% with yearly billing` : "Pay once for the year"}
      </p>
    </div>
  );
}

export function BillingPageClient() {
  const { token, user } = useAuth();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [sub, setSub] = useState<AccountSubscription | null>(null);
  const [yearly, setYearly] = useState(false);
  const [country, setCountry] = useState(user?.country ?? "");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const useIdr = useMemo(() => isIndonesiaCountry(country || detectCountryCode()), [country]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    deferEffectRun(() => setLoading(true));
    Promise.all([api.listSubscriptionPlans(token), api.getSubscription(token)])
      .then(([planList, entitlement]) => {
        if (cancelled) return;
        setPlans(planList);
        setSub(entitlement);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load plans");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Persist detected country for accounts that signed up before country was stored
  useEffect(() => {
    if (!token) return;
    deferEffectRun(() => {
      const stored = (user?.country ?? "").trim().toUpperCase();
      if (stored) {
        setCountry(stored);
        return;
      }
      const detected = detectCountryCode();
      if (!detected) return;
      setCountry(detected);
      void api.updateProfile(token, { country: detected }).catch(() => undefined);
    });
  }, [token, user?.country]);

  async function selectPlan(code: string) {
    if (!token) return;
    setSubmitting(code);
    setError(null);
    setSuccess(null);
    try {
      const result = await api.requestSubscriptionPlan(token, code);
      setSub(result.entitlement);
      setSuccess(
        `Request submitted for ${result.requested_plan.name}. A superadmin will activate your package after payment confirmation.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit request");
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <>
      <div className="mb-8">
        <VoiceMinutesCard />
      </div>
      <PageHeader
        align="center"
        title="Choose a plan"
        subtitle="Select a package. Activation is manual after offline payment confirmation."
      />

      {sub?.pending_request ? (
        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
          You already have a pending request for{" "}
          <span className="font-medium">{sub.pending_request.requested_plan_name}</span>. Selecting
          another plan will replace it.
        </div>
      ) : null}

      {error ? (
        <p className="mb-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="mb-3 text-sm text-emerald-700 dark:text-emerald-400" role="status">
          {success}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading plans…</p>
      ) : (
        <div className="-mt-1 flex flex-col items-center gap-3">
          <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            Prices in {useIdr ? "IDR (Rp)" : "USD ($)"}
          </span>
          <BillingCycleToggle
            yearly={yearly}
            onChange={setYearly}
            savePercent={Math.max(
              0,
              ...plans.map((plan) => plan.yearly_discount_percent ?? 0),
            )}
          />
          <div className="grid w-full gap-4 md:grid-cols-3 md:items-stretch">
            {plans.map((plan) => {
              const isCurrent = sub?.plan_code === plan.code && sub.status === "active";
              const isPending = sub?.pending_request?.requested_plan_code === plan.code;
              const details = PLAN_DETAILS[plan.code];
              const features = details?.features(plan) ?? [
                `Up to ${plan.workspace_limit} workspace${plan.workspace_limit === 1 ? "" : "s"}`,
              ];
              const currency = useIdr ? details?.idr : details?.usd;
              const price = useIdr
                ? yearly
                  ? formatIdr(plan.yearly_price_idr ?? 0)
                  : formatIdr(plan.monthly_price_idr ?? 0)
                : currency
                  ? yearly
                    ? currency.yearly
                    : currency.monthly
                  : "Custom";
              const period = yearly ? "/yr" : "/mo";
              const isEnterprise = plan.code === "enterprise";
              const { currency: currencyLabel, amount } = splitPrice(price);

              return (
                <PricingCard
                  key={plan.code}
                  className={cn(
                    "mx-auto h-full max-w-xs md:mx-0 md:max-w-none",
                    isPending && "ring-2 ring-primary/40",
                  )}
                >
                  <PricingHeader className="mb-0">
                    <div>
                      <PricingPlan>
                        <PricingPlanName>
                          {plan.code === "growth" ? <SparklesIcon /> : null}
                          {plan.name}
                        </PricingPlanName>
                        {isCurrent ? (
                          <PricingBadge>Current</PricingBadge>
                        ) : details?.badge ? (
                          <PricingBadge>{details.badge}</PricingBadge>
                        ) : null}
                      </PricingPlan>
                      <PricingDescription>
                        {details?.tagline ??
                          `Up to ${plan.workspace_limit} workspace${plan.workspace_limit === 1 ? "" : "s"}`}
                      </PricingDescription>
                    </div>

                    <PricingPrice>
                      {details?.pricePrefix ? (
                        <PricingPricePrefix>{details.pricePrefix}</PricingPricePrefix>
                      ) : null}
                      <PricingMainPrice>
                        {currencyLabel ? `${currencyLabel} ${amount}` : amount}
                      </PricingMainPrice>
                      <PricingPeriod>{period}</PricingPeriod>
                    </PricingPrice>
                  </PricingHeader>

                  <PricingBody>
                    {details?.includedLabel ? (
                      <PricingSeparator>{details.includedLabel}</PricingSeparator>
                    ) : null}
                    <PricingList>
                      {features.map((feature) => (
                        <PricingListItem key={feature}>
                          <CircleCheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
                          <span>{feature}</span>
                        </PricingListItem>
                      ))}
                    </PricingList>
                    <Button
                      className="mt-auto w-full"
                      disabled={Boolean(submitting) || isCurrent}
                      onClick={() => void selectPlan(plan.code)}
                    >
                      {submitting === plan.code
                        ? "Submitting…"
                        : isCurrent
                          ? "Current plan"
                          : isPending
                            ? "Selected (pending)"
                            : isEnterprise
                              ? "Contact sales"
                              : "Select plan"}
                    </Button>
                  </PricingBody>
                </PricingCard>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
