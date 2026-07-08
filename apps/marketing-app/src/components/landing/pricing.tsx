"use client";

import { useState } from "react";

import { adminLoginUrl } from "@/lib/site-links";

type Plan = {
  name: string;
  description: string;
  features: readonly string[];
  cta: string;
  href: string;
  highlighted?: boolean;
  monthlyPrice?: number;
  yearlyPrice?: number;
  priceLabel?: string;
};

const PLANS: readonly Plan[] = [
  {
    name: "Starter",
    monthlyPrice: 49,
    yearlyPrice: 470,
    description:
      "For one location getting started with voice ordering. Launch fast with menu setup and a shareable store link.",
    features: [
      "1 store location",
      "Voice ordering + menu",
      "Payment QR checkout",
      "Basic analytics",
      "Email support",
    ],
    cta: "Start free trial",
    href: adminLoginUrl,
  },
  {
    name: "Growth",
    monthlyPrice: 149,
    yearlyPrice: 1430,
    description:
      "For growing brands with multiple locations. More control over AI, branding, and order insights as you scale.",
    features: [
      "Up to 5 locations",
      "Custom appearance",
      "AI rules & knowledge base",
      "Orders & conversation history",
      "Advanced analytics",
    ],
    cta: "Get growth",
    href: adminLoginUrl,
    highlighted: true,
  },
  {
    name: "Enterprise",
    priceLabel: "Custom",
    description:
      "For multi-brand operators with custom needs. Dedicated support, SLAs, and integrations built for scale.",
    features: [
      "Unlimited locations",
      "Custom AI models & SLA",
      "Dedicated support",
      "SSO & custom integrations",
    ],
    cta: "Contact sales",
    href: "mailto:hello@lore.app",
  },
];

function BillingToggle({
  yearly,
  onChange,
}: {
  yearly: boolean;
  onChange: (yearly: boolean) => void;
}) {
  const [morphing, setMorphing] = useState(false);

  function handleToggle() {
    setMorphing(true);
    onChange(!yearly);
    window.setTimeout(() => setMorphing(false), 500);
  }

  return (
    <div className="flex items-center justify-center gap-3">
      <span
        className={`text-sm transition-colors duration-300 ${yearly ? "text-white/40" : "text-white"}`}
      >
        Monthly
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={yearly}
        aria-label="Toggle yearly billing"
        onClick={handleToggle}
        className={`relative h-7 w-12 rounded-full border transition-colors duration-300 ${
          yearly ? "border-[#FF4081]/40 bg-[#FF4081]/15" : "border-white/40 bg-white/10"
        }`}
      >
        <span
          className={`absolute top-1/2 h-5 -translate-y-1/2 rounded-full bg-[#FF4081] transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
            morphing ? "w-6" : "w-5"
          } ${
            yearly
              ? `${morphing ? "left-[calc(100%-1.5rem-0.25rem)]" : "left-[calc(100%-1.25rem-0.25rem)]"} shadow-[0_0_12px_rgba(255,64,129,0.35)]`
              : "left-1"
          }`}
        />
      </button>
      <span
        className={`text-sm transition-colors duration-300 ${yearly ? "text-white" : "text-white/40"}`}
      >
        Yearly
      </span>
    </div>
  );
}

function PlanBullet({ label }: { label: string }) {
  return (
    <li className="flex items-center gap-3">
      <span className="h-1.5 w-1.5 shrink-0 bg-white" aria-hidden />
      <span className="text-sm text-white">{label}</span>
    </li>
  );
}

function PricingCard({ plan, yearly }: { plan: Plan; yearly: boolean }) {
  const period = yearly ? "/year" : "/mo";
  const price =
    plan.priceLabel ??
    `$${yearly ? plan.yearlyPrice : plan.monthlyPrice}`;

  return (
    <article className="relative flex h-full min-h-[580px] flex-col bg-black p-8 sm:min-h-[620px] sm:p-10">
      <div className="relative text-center">
        <h3 className="text-lg font-medium text-white">{plan.name}</h3>
        <div className="mt-4 flex items-end justify-center gap-1">
          <span className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            {price}
          </span>
          {plan.priceLabel ? null : (
            <span className="pb-1 text-sm text-white">{period}</span>
          )}
        </div>
        <p className="mt-3 text-sm text-white/60">{plan.description}</p>
      </div>

      <a
        href={plan.href}
        className={`relative mt-8 inline-flex w-full items-center justify-center rounded-full px-5 py-3 text-sm font-medium transition ${
          plan.highlighted
            ? "bg-[#FF4081] text-white hover:bg-[#ff5a96]"
            : "border border-white bg-white text-black hover:bg-white/90"
        }`}
      >
        {plan.cta}
      </a>

      <ul className="relative mt-8 flex flex-1 flex-col gap-3">
        {plan.features.map((feature) => (
          <PlanBullet key={feature} label={feature} />
        ))}
      </ul>
    </article>
  );
}

export function PricingSection() {
  const [yearly, setYearly] = useState(true);

  return (
    <section id="pricing" className="bg-black">
      <div className="landing-container border-x border-dashed border-white/10">
        <div className="px-6 py-20 sm:px-8 sm:py-24 lg:px-10">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 text-sm uppercase tracking-wide text-[#737373]">Pricing</div>
            <h2 className="text-[clamp(1.75rem,4vw,2.75rem)] font-semibold leading-[1.15] tracking-tight text-white">
              <span className="block">Choose the plan that</span>
              <span className="block">fits your business.</span>
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-white/60">
              Simple, transparent pricing with everything you need to run voice commerce and scale
              with confidence.
            </p>
          </div>

          <div className="mt-10">
            <BillingToggle yearly={yearly} onChange={setYearly} />
          </div>

          <div className="mt-10 border border-white/10">
            <div className="grid grid-cols-1 gap-px bg-white/10 lg:grid-cols-3">
              {PLANS.map((plan) => (
                <PricingCard key={plan.name} plan={plan} yearly={yearly} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
