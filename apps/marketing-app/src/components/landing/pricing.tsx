import { Check } from "lucide-react";

import { adminLoginUrl } from "@/lib/site-links";

const PLANS = [
  {
    name: "Starter",
    price: "$49",
    period: "/mo",
    description: "Single location getting started with voice ordering.",
    features: [
      "1 store location",
      "Voice ordering + menu",
      "Payment QR checkout",
      "Basic analytics",
    ],
    cta: "Start free trial",
    highlighted: false,
  },
  {
    name: "Growth",
    price: "$149",
    period: "/mo",
    description: "Growing brands that need control and insights.",
    features: [
      "Up to 5 locations",
      "Custom appearance",
      "AI rules & knowledge base",
      "Orders & conversation history",
      "Advanced analytics",
    ],
    cta: "Start free trial",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "Multi-brand operators with custom needs.",
    features: [
      "Unlimited locations",
      "Custom AI models & SLA",
      "Dedicated support",
      "SSO & custom integrations",
    ],
    cta: "Contact sales",
    highlighted: false,
  },
];

export function PricingSection() {
  return (
    <section id="pricing" className="bg-slate-50 py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-orange-500">Pricing</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Simple plans that scale with you
          </h2>
          <p className="mt-4 text-base leading-relaxed text-slate-600">
            Placeholder pricing for launch. All plans include core voice ordering — pick what fits
            your operation.
          </p>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {PLANS.map((plan) => (
            <article
              key={plan.name}
              className={`flex flex-col rounded-2xl border p-8 ${
                plan.highlighted
                  ? "border-orange-200 bg-white shadow-xl shadow-orange-500/10 ring-1 ring-orange-100"
                  : "border-slate-200 bg-white shadow-sm"
              }`}
            >
              {plan.highlighted ? (
                <span className="mb-4 inline-flex w-fit rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-700">
                  Most popular
                </span>
              ) : (
                <span className="mb-4 h-6" />
              )}

              <h3 className="text-lg font-semibold text-slate-900">{plan.name}</h3>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-4xl font-semibold tracking-tight text-slate-900">
                  {plan.price}
                </span>
                {plan.period ? (
                  <span className="text-sm text-slate-500">{plan.period}</span>
                ) : null}
              </div>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">{plan.description}</p>

              <ul className="mt-6 flex-1 space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-slate-700">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" aria-hidden />
                    {feature}
                  </li>
                ))}
              </ul>

              <a
                href={plan.name === "Enterprise" ? "mailto:hello@lore.app" : adminLoginUrl}
                className={`mt-8 inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition ${
                  plan.highlighted
                    ? "bg-orange-500 text-white hover:bg-orange-600"
                    : "bg-slate-900 text-white hover:bg-slate-800"
                }`}
              >
                {plan.cta}
              </a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
