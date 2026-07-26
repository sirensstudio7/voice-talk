"use client";

import { useEffect, useRef } from "react";

import { VerticalMarquee } from "@/components/landing/vertical-marquee";
import { adminSignupUrl, demoUrl } from "@/lib/site-links";

const AUDIENCES = [
  "Coffee Shops",
  "Quick-Service Restaurants",
  "Retail Stores",
  "Events",
  "Healthcare Clinics",
  "Multi-Location Brands",
] as const;

function ShimmerButton({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
}) {
  const isPrimary = variant === "primary";

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`group relative overflow-hidden rounded-md px-6 py-3 text-sm font-medium transition-all duration-300 hover:scale-105 hover:shadow-lg sm:text-[15px] ${
        isPrimary
          ? "bg-[#181818] text-white"
          : "border border-[#e2e8f0] bg-[#f8fafc] text-[#181818]"
      }`}
    >
      <span className="relative z-10">{children}</span>
      <div
        className={`absolute inset-0 translate-x-[-200%] bg-gradient-to-r from-transparent transition-transform duration-700 group-hover:translate-x-[200%] ${
          isPrimary ? "via-white/20" : "via-[#181818]/10"
        } to-transparent`}
        aria-hidden
      />
    </a>
  );
}

export function PreFooterCta() {
  const marqueeContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = marqueeContainerRef.current;
    if (!container) return;

    const updateOpacity = () => {
      const items = container.querySelectorAll<HTMLElement>(".marquee-item");
      const bounds = container.getBoundingClientRect();
      const centerY = bounds.top + bounds.height / 2;

      items.forEach((item) => {
        const itemBounds = item.getBoundingClientRect();
        const itemCenterY = itemBounds.top + itemBounds.height / 2;
        const distance = Math.abs(centerY - itemCenterY);
        const maxDistance = bounds.height / 2;
        const opacity = 1 - Math.min(distance / maxDistance, 1) * 0.75;
        item.style.opacity = opacity.toString();
      });
    };

    let frameId = 0;
    const tick = () => {
      updateOpacity();
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, []);

  return (
    <section className="border-b border-dashed border-black/[0.06] bg-white">
      <div className="landing-container border-x border-dashed border-black/[0.06]">
        <div className="overflow-hidden py-20 sm:px-8 sm:py-24 lg:px-10">
          <div className="pre-footer-fade-in-up grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-24">
            <div className="max-w-xl space-y-8">
              <h2 className="pre-footer-fade-in-up text-[clamp(2.5rem,5vw,4.5rem)] font-medium leading-tight tracking-tight text-[#181818] [animation-delay:200ms]">
                Get Started in Minutes
              </h2>
              <p className="pre-footer-fade-in-up text-lg leading-relaxed text-[#64748b] md:text-xl [animation-delay:400ms]">
                Launch voice ordering for your store without rebuilding your stack. Sign up free
                and share your live demo link in minutes.
              </p>
              <div className="pre-footer-fade-in-up flex flex-wrap gap-4 [animation-delay:600ms]">
                <ShimmerButton href={adminSignupUrl}>Start free trial</ShimmerButton>
                <ShimmerButton href={demoUrl} variant="secondary">
                  Try live demo
                </ShimmerButton>
              </div>
            </div>

            <div
              ref={marqueeContainerRef}
              className="pre-footer-fade-in-up relative flex h-[600px] items-center justify-center lg:h-[700px] [animation-delay:400ms]"
            >
              <div className="relative h-full w-full">
                <VerticalMarquee speed={20} className="h-full">
                  {AUDIENCES.map((audience) => (
                    <div
                      key={audience}
                      className="marquee-item py-8 text-4xl font-light tracking-tight text-[#181818] md:text-5xl lg:text-6xl xl:text-7xl"
                      style={{ opacity: 0.25 }}
                    >
                      {audience}
                    </div>
                  ))}
                </VerticalMarquee>
                <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-64 bg-gradient-to-b from-white via-white/50 to-transparent" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-64 bg-gradient-to-t from-white via-white/50 to-transparent" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
