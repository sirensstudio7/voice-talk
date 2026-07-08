import type { ComponentType } from "react";

import { FeaturesUseCaseTicker } from "@/components/landing/features-use-case-ticker";
import {
  AppearanceVisual,
  AvatarVisual,
  BilingualVisual,
  DashboardVisual,
  MenuVisual,
  VoiceOrderingVisual,
} from "@/components/landing/features-capability-visuals";

const CAPABILITIES = [
  {
    title: "Real-time voice ordering",
    description:
      "Customers hold to talk and order naturally. Powered by Gemini Live with low-latency WebSocket sessions.",
    visual: VoiceOrderingVisual,
  },
  {
    title: "3D AI avatar",
    description:
      "A lifelike assistant greets every customer with talking animations and a premium, human feel.",
    visual: AvatarVisual,
  },
  {
    title: "Voice + visual menu",
    description:
      "Browse the menu on screen while ordering by voice. Items fly into the basket with smooth feedback.",
    visual: MenuVisual,
  },
  {
    title: "Merchant dashboard",
    description:
      "Manage menu, AI knowledge, rules, orders, conversations, payment QR, and analytics in one place.",
    visual: DashboardVisual,
  },
  {
    title: "Custom appearance",
    description:
      "Upload a background image and tune the bottom gradient to match your brand on every device.",
    visual: AppearanceVisual,
  },
  {
    title: "Bilingual EN / ID",
    description:
      "Switch between English and Indonesian mid-session. Perfect for local cafés and regional chains.",
    visual: BilingualVisual,
  },
] as const;

function CapabilityCard({
  title,
  description,
  visual: Visual,
}: {
  title: string;
  description: string;
  visual: ComponentType;
}) {
  return (
    <article className="flex h-full flex-col bg-black">
      <div className="relative h-[260px] shrink-0 sm:h-[280px]">
        <Visual />
      </div>

      <div className="flex flex-1 flex-col gap-3 px-6 py-5">
        <h3 className="text-xl font-medium leading-snug text-white">{title}</h3>
        <p className="text-sm leading-relaxed text-white">{description}</p>
      </div>
    </article>
  );
}

export function FeaturesGrid() {
  return (
    <section id="features" className="bg-black">
      <div className="landing-container border-x border-dashed border-white/10">
        <div className="px-6 py-20 sm:px-8 sm:py-24 lg:px-10">
          <div className="text-left">
            <div className="mb-6 text-sm uppercase tracking-wide text-[#737373]">
              Capabilities
            </div>

            <h2 className="text-[clamp(1.75rem,4vw,2.75rem)] font-semibold leading-[1.15] tracking-tight text-white">
              <span className="block">Everything You Need to Run Voice Commerce</span>
              <span className="block">From First Hello to Payment</span>
            </h2>
          </div>

          <div className="mt-14 border border-white/10">
            <div className="grid grid-cols-1 gap-px bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
              {CAPABILITIES.map((capability) => (
                <CapabilityCard key={capability.title} {...capability} />
              ))}
            </div>
          </div>
        </div>

        <FeaturesUseCaseTicker />
      </div>
    </section>
  );
}
