import type { ComponentType } from "react";

import {
  SetupStoreVisual,
  ShareLinkVisual,
  VoiceOrderVisual,
} from "@/components/landing/how-it-works-visuals";

const SOLUTIONS = [
  {
    tag: "Store setup",
    title: "Set Up Your Store in Minutes",
    description:
      "Add your menu, train AI rules, upload your payment QR, and customize appearance in the Lore admin dashboard.",
    bullets: ["Menu & AI knowledge base", "Payment QR upload", "Custom brand appearance"],
    visual: SetupStoreVisual,
  },
  {
    tag: "Share link",
    title: "Give Customers a Simple URL",
    description:
      "Give customers a simple URL like lore.app/b/your-store. No app download — works on any modern phone or desktop.",
    bullets: ["No app download needed", "Works on any device", "Share via QR or link"],
    visual: ShareLinkVisual,
  },
  {
    tag: "Voice ordering",
    title: "Customers Order Naturally by Voice",
    description:
      "They talk to your AI cashier, review the basket, confirm the order, and pay by scanning your QR code.",
    bullets: ["Natural voice conversations", "Visual menu & basket", "QR payment at checkout"],
    visual: VoiceOrderVisual,
  },
] as const;

function SolutionTag({ label }: { label: string }) {
  return (
    <div className="inline-flex items-center gap-2">
      <div className="flex flex-col gap-0.5" aria-hidden>
        <div className="h-3 w-0.5 rounded-full bg-gradient-to-t from-[#0036FA] to-[#C0E2F9]" />
        <div className="h-3 w-0.5 rotate-180 rounded-full bg-gradient-to-t from-[#0036FA] to-[#C0E2F9]" />
      </div>
      <span className="text-sm text-[#181818]">{label}</span>
    </div>
  );
}

function BulletItem({ label }: { label: string }) {
  return (
    <li className="flex items-center gap-3">
      <span className="h-1.5 w-1.5 shrink-0 bg-[#181818]" aria-hidden />
      <span className="text-sm leading-relaxed text-[#181818]">{label}</span>
    </li>
  );
}

function SolutionRow({
  tag,
  title,
  description,
  bullets,
  visual: Visual,
  reverse = false,
}: {
  tag: string;
  title: string;
  description: string;
  bullets: readonly string[];
  visual: ComponentType;
  reverse?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-14">
      <div className={reverse ? "lg:order-2" : "lg:order-1"}>
        <SolutionTag label={tag} />
        <h3 className="mt-4 text-2xl font-semibold leading-snug tracking-tight text-[#181818] sm:text-[1.75rem]">
          {title}
        </h3>
        <p className="mt-3 text-sm leading-relaxed text-[#46484d] sm:text-base">{description}</p>
        <ul className="mt-6 flex flex-col gap-3">
          {bullets.map((bullet) => (
            <BulletItem key={bullet} label={bullet} />
          ))}
        </ul>
      </div>

      <div className={reverse ? "lg:order-1" : "lg:order-2"}>
        <Visual />
      </div>
    </div>
  );
}

export function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-white">
      <div className="landing-container border-x border-dashed border-black/[0.06]">
        <div className="px-6 py-20 sm:px-8 sm:py-24 lg:px-10">
          <div className="mx-auto max-w-4xl text-center">
            <div className="mb-6 text-sm uppercase tracking-wide text-[#737373]">How it works</div>
            <h2 className="text-[clamp(1.75rem,4vw,2.75rem)] font-semibold leading-[1.15] tracking-tight text-[#181818]">
              Go From Sign-Up to Your First Voice Order in an Afternoon
            </h2>
          </div>

          <div className="mt-16 flex flex-col gap-20 sm:mt-20 sm:gap-24 lg:mt-24">
            {SOLUTIONS.map((solution, index) => (
              <SolutionRow key={solution.tag} {...solution} reverse={index % 2 === 1} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
