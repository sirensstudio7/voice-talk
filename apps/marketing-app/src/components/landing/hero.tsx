import Image from "next/image";

import { ContainerScroll } from "@/components/landing/container-scroll";
import { GradientCtaButton } from "@/components/landing/gradient-cta-button";
import { HeroBrandTicker } from "@/components/landing/hero-brand-ticker";
import { HeroVoicePreview } from "@/components/landing/hero-voice-preview";

const GRAPH_BG =
  "https://framerusercontent.com/images/moVvtNfD7ggIlDd44uwH5HnZY.svg?width=1262&height=546";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-white">
      <div className="landing-container relative border border-dashed border-black/[0.06] pt-28 sm:pt-32">
        <div className="relative">
          <div
            className="pointer-events-none absolute -inset-x-4 top-32 hidden -rotate-[5.69deg] lg:block"
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

          <ContainerScroll
            titleComponent={
              <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center text-center">
                <div className="mb-5 inline-flex rounded-full border border-black/[0.06] bg-white px-4 py-1.5 text-xs text-[#181818] sm:mb-8 sm:px-5 sm:py-2 sm:text-sm">
                  Join +1000 scaling businesses
                </div>

                <h1 className="text-[clamp(2rem,5.5vw,3.75rem)] font-semibold leading-[1.08] tracking-tight text-[#181818]">
                  Conversation That
                  <br />
                  Never Sleep
                </h1>

                <p className="mt-5 max-w-xl text-base leading-relaxed text-[#46484d] sm:text-lg">
                  Make every customer interaction faster, smarter, and more natural with
                  conversations powered by your business knowledge.
                </p>

                <div className="mt-6 flex flex-col items-center gap-3 sm:mt-10">
                  <GradientCtaButton href="/request-demo">Request demo</GradientCtaButton>
                </div>
              </div>
            }
          >
            <div
              className="overflow-hidden rounded-xl border border-black/[0.06] bg-white shadow-[0_24px_80px_-24px_rgba(15,23,42,0.18)]"
              data-lenis-prevent
            >
              <HeroVoicePreview />
            </div>
          </ContainerScroll>
        </div>

        <HeroBrandTicker />
      </div>
    </section>
  );
}
