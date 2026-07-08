import Image from "next/image";

import { HeroBrandTicker } from "@/components/landing/hero-brand-ticker";
import { HeroVoicePreview } from "@/components/landing/hero-voice-preview";
import { HeroDashboardScale } from "@/components/landing/hero-dashboard-scale";
import { adminLoginUrl } from "@/lib/site-links";

const GRAPH_BG =
  "https://framerusercontent.com/images/moVvtNfD7ggIlDd44uwH5HnZY.svg?width=1262&height=546";

const GRADIENT_CTA =
  "linear-gradient(90deg, rgb(33, 204, 238) 0%, rgb(20, 112, 239) 33.2763%, rgb(105, 39, 218) 68.4697%, rgb(242, 61, 148) 100%)";

function GradientCtaButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="group relative inline-flex rounded-full p-[2px] transition-transform hover:scale-[1.02] active:scale-[0.98]"
      style={{ background: GRADIENT_CTA }}
    >
      <span
        className="pointer-events-none absolute inset-0 rounded-full opacity-70 blur-[17px] transition-opacity group-hover:opacity-90"
        style={{ background: GRADIENT_CTA }}
        aria-hidden
      />
      <span
        className="relative inline-flex min-w-[220px] items-center justify-center rounded-full px-8 py-3.5 text-sm font-medium text-white sm:min-w-[260px] sm:text-[15px]"
        style={{
          background:
            "linear-gradient(rgb(255, 255, 255) -51%, rgb(16, 2, 2) 18%, rgb(16, 2, 2) 132%)",
        }}
      >
        {children}
      </span>
    </a>
  );
}

export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-white">
      <div className="landing-container relative border border-dashed border-black/[0.06] pt-28 sm:pt-32">
        <div className="pb-16 sm:pb-20">
          <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center text-center">
            <div className="mb-8 inline-flex rounded-full border border-black/[0.06] bg-white px-5 py-2 text-sm text-[#181818]">
              Join +1000 scaling businesses
            </div>

            <h1 className="text-[clamp(2rem,5.5vw,3.75rem)] font-semibold leading-[1.08] tracking-tight text-[#181818]">
              Conversation That
              <br />
              Never Sleep
            </h1>

            <p className="mt-5 max-w-xl text-base leading-relaxed text-[#46484d] sm:text-lg">
              Make every customer interaction faster, smarter, and more natural with conversations
              powered by your business knowledge.
            </p>

            <div className="mt-10 flex flex-col items-center gap-3">
              <GradientCtaButton href={adminLoginUrl}>Get 14 Days Free Trial</GradientCtaButton>
              <p className="text-sm text-[#46484d]">No Credit Card Required</p>
            </div>
          </div>

          <div className="relative mx-auto mt-14 w-full sm:mt-16">
            <div
              className="pointer-events-none absolute -inset-x-4 top-8 hidden -rotate-[5.69deg] lg:block"
              aria-hidden
            >
              <div className="relative aspect-[1262/546] w-[calc(100%+90px)] max-w-none -translate-x-[45px]">
                <Image
                  src={GRAPH_BG}
                  alt=""
                  fill
                  className="object-cover object-center"
                  sizes="(min-width: 1024px) 1280px, 0px"
                  priority
                />
              </div>
            </div>

            <HeroDashboardScale>
              <div className="overflow-hidden rounded-xl border border-black/[0.06] bg-white shadow-[0_24px_80px_-24px_rgba(15,23,42,0.18)]">
                <HeroVoicePreview />
              </div>
            </HeroDashboardScale>
          </div>
        </div>

        <HeroBrandTicker />
      </div>
    </section>
  );
}
