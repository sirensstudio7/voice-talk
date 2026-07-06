import {
  Globe2,
  LayoutDashboard,
  Mic,
  Palette,
  ShoppingBag,
  Sparkles,
} from "lucide-react";

const FEATURES = [
  {
    icon: Mic,
    title: "Real-time voice ordering",
    description:
      "Customers hold to talk and order naturally. Powered by Gemini Live with low-latency WebSocket sessions.",
  },
  {
    icon: Sparkles,
    title: "3D AI avatar",
    description:
      "A lifelike assistant greets every customer with talking animations and a premium, human feel.",
  },
  {
    icon: ShoppingBag,
    title: "Voice + visual menu",
    description:
      "Browse the menu on screen while ordering by voice. Items fly into the basket with smooth feedback.",
  },
  {
    icon: LayoutDashboard,
    title: "Merchant dashboard",
    description:
      "Manage menu, AI knowledge, rules, orders, conversations, payment QR, and analytics in one place.",
  },
  {
    icon: Palette,
    title: "Custom appearance",
    description:
      "Upload a background image and tune the bottom gradient to match your brand on every device.",
  },
  {
    icon: Globe2,
    title: "Bilingual EN / ID",
    description:
      "Switch between English and Indonesian mid-session. Perfect for local cafés and regional chains.",
  },
];

export function FeaturesGrid() {
  return (
    <section id="features" className="bg-slate-50 py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-orange-500">Features</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Everything you need to run voice commerce
          </h2>
          <p className="mt-4 text-base leading-relaxed text-slate-600">
            From the first hello to payment confirmation — Lore handles the full ordering flow.
          </p>
        </div>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <article
              key={title}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-50 text-orange-500 ring-1 ring-orange-100">
                <Icon className="h-5 w-5" aria-hidden />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-slate-900">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
