"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline";

import { GradientCtaButton } from "@/components/landing/gradient-cta-button";
import { adminLoginUrl, adminSignupUrl } from "@/lib/site-links";

const NAV_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#faq", label: "FAQ" },
];

function AuthLinks({ className }: { className?: string }) {
  return (
    <div className={className}>
      <a
        href={adminLoginUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm font-medium text-[#46484d] transition hover:text-[#181818]"
      >
        Sign in
      </a>
      <GradientCtaButton href={adminSignupUrl} size="compact">
        Sign up
      </GradientCtaButton>
    </div>
  );
}

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileMenuOpen(false);
    }

    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [mobileMenuOpen]);

  function closeMobileMenu() {
    setMobileMenuOpen(false);
  }

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-dashed border-black/[0.06] bg-white">
      <div
        className={`landing-container flex flex-col border-x border-dashed border-black/[0.06] max-md:!px-0 max-md:w-full max-md:max-w-none ${mobileMenuOpen ? "h-dvh md:h-auto" : ""}`}
      >
        <div className="flex h-16 w-full items-center justify-between px-4 sm:px-8 lg:px-10">
          <Link href="/" className="flex items-center gap-2 text-[#181818]">
            <span className="text-lg font-semibold tracking-tight">Lorescale</span>
          </Link>

          <nav className="hidden items-center gap-8 md:flex">
            {NAV_LINKS.map(({ href, label }) => (
              <a
                key={href}
                href={href}
                className="text-sm font-medium text-[#46484d] transition hover:text-[#181818]"
              >
                {label}
              </a>
            ))}
          </nav>

          <AuthLinks className="hidden items-center gap-2 sm:gap-3 md:flex" />

          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md p-2 text-[#46484d] transition hover:bg-black/[0.04] hover:text-[#181818] md:hidden"
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-nav-menu"
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMobileMenuOpen((open) => !open)}
          >
            {mobileMenuOpen ? (
              <XMarkIcon className="size-6" aria-hidden />
            ) : (
              <Bars3Icon className="size-6" aria-hidden />
            )}
          </button>
        </div>

        {mobileMenuOpen ? (
          <div
            id="mobile-nav-menu"
            className="flex flex-1 flex-col border-t border-dashed border-black/[0.06] bg-white md:hidden"
          >
            <nav className="flex flex-col gap-1 px-4 py-4 sm:px-8">
              {NAV_LINKS.map(({ href, label }) => (
                <a
                  key={href}
                  href={href}
                  className="rounded-md px-0 py-3 text-4xl font-medium text-[#46484d] transition hover:bg-black/[0.04] hover:text-[#181818]"
                  onClick={closeMobileMenu}
                >
                  {label}
                </a>
              ))}
            </nav>

            <div className="mt-auto flex flex-col gap-3 border-t border-dashed border-black/[0.06] px-4 py-4 sm:px-8">
              <a
                href={adminLoginUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md px-3 py-2.5 text-center text-sm font-medium text-[#46484d] transition hover:bg-black/[0.04] hover:text-[#181818]"
                onClick={closeMobileMenu}
              >
                Sign in
              </a>
              <GradientCtaButton
                href={adminSignupUrl}
                size="compact"
                fullWidth
                onClick={closeMobileMenu}
              >
                Sign up
              </GradientCtaButton>
            </div>
          </div>
        ) : null}
      </div>
    </header>
  );
}
