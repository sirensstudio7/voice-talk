import Image from "next/image";
import type { SVGProps } from "react";
import { ChevronRight } from "lucide-react";

import { FooterFitText } from "@/components/landing/footer-fit-text";
import { FooterNewsletter } from "@/components/landing/footer-newsletter";
import { adminLoginUrl } from "@/lib/site-links";

type SocialIconComponent = (props: SVGProps<SVGSVGElement>) => React.ReactElement;

function LinkedInIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.124 2.062 2.062 0 0 1 0 4.124zM7.119 20.452H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

function TwitterIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function InstagramIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
    </svg>
  );
}

function GithubIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

const FOOTER_PATTERN =
  "https://framerusercontent.com/images/wGAHOWhVswEtWkOKTJN6s2CW0.svg";

const NAV_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
] as const;

const SOCIAL_LINKS: ReadonlyArray<{
  href: string;
  label: string;
  icon: SocialIconComponent;
}> = [
  { href: "https://linkedin.com", label: "LinkedIn", icon: LinkedInIcon },
  { href: "https://twitter.com", label: "Twitter", icon: TwitterIcon },
  { href: "https://instagram.com", label: "Instagram", icon: InstagramIcon },
  { href: "https://github.com", label: "Github", icon: GithubIcon },
];

const COMMUNITY_AVATARS = [
  "https://framerusercontent.com/images/XQBcFnxyK3FSny302gO7Gggkdsw.jpg?scale-down-to=512",
  "https://framerusercontent.com/images/6OOWa2zIdujTmN3ZdUxz0qFSaRA.jpg?scale-down-to=512",
  "https://framerusercontent.com/images/DWQnRIOnYe0oPL85YbQQLSUPo.jpg?scale-down-to=512",
  "https://framerusercontent.com/images/6KKDj9gnqEHDNBTD7GWaqkIug8.jpg?scale-down-to=512",
  "https://framerusercontent.com/images/MDE7XIBGnAp7GIZqwSV00Vh90.jpg?scale-down-to=512",
] as const;

function FooterLink({
  href,
  label,
  external,
}: {
  href: string;
  label: string;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="group flex items-center gap-2 text-sm text-[#C2FA69] transition hover:text-[#d4ff85]"
    >
      <ChevronRight
        className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5"
        aria-hidden
      />
      {label}
    </a>
  );
}

function SocialLink({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: SocialIconComponent;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="text-[#C2FA69] transition hover:text-[#d4ff85]"
    >
      <Icon className="h-5 w-5" />
    </a>
  );
}

export function Footer() {
  return (
    <footer className="bg-white pb-8 pt-16 sm:pb-10 sm:pt-20">
      <div className="landing-container">
        <div className="relative overflow-hidden rounded-t-[30px] bg-gradient-to-b from-[#C2FA69] to-[#9CCC50]">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.09]"
            style={{
              backgroundImage: `url("${FOOTER_PATTERN}")`,
              backgroundRepeat: "repeat",
              backgroundPosition: "center",
              backgroundSize: "26.5px",
            }}
            aria-hidden
          />

          <div className="relative px-6 py-12 sm:px-10 sm:py-14 lg:py-16">
            <div className="max-w-xl">
              <h2 className="text-[clamp(1.75rem,4vw,2.75rem)] font-semibold leading-[1.1] tracking-tight text-[#0F0F0F]">
                Ready to Transform Your Business with Lorescale?
              </h2>
              <p className="mt-4 text-base leading-relaxed text-[#0F0F0F]/80">
                Take the next step toward smarter voice ordering, better customer conversations, and
                a dashboard that keeps your store running around the clock.
              </p>
              <a
                href={adminLoginUrl}
                className="mt-8 inline-flex rounded-full bg-black px-7 py-3.5 text-sm font-medium text-white shadow-[0_80px_32px_-5px_rgba(0,0,0,0)] transition hover:bg-[#1a1a1a]"
              >
                Get started for free
              </a>
            </div>
          </div>
        </div>

        <div className="rounded-b-[30px] bg-black">
          <div className="grid gap-12 px-6 py-12 sm:px-10 sm:py-14 lg:grid-cols-[1fr_1fr_1.2fr] lg:gap-10">
            <div className="space-y-3">
              {NAV_LINKS.map((link) => (
                <FooterLink key={link.label} {...link} />
              ))}
            </div>

            <div className="flex items-start gap-5 self-start">
              {SOCIAL_LINKS.map((link) => (
                <SocialLink key={link.label} {...link} />
              ))}
            </div>

            <div className="space-y-8">
              <FooterNewsletter />

              <div>
                <div className="flex -space-x-2">
                  {COMMUNITY_AVATARS.map((src, index) => (
                    <div
                      key={src}
                      className="relative h-12 w-12 overflow-hidden rounded-2xl border-2 border-black ring-1 ring-white/10"
                      style={{ zIndex: COMMUNITY_AVATARS.length - index }}
                    >
                      <Image src={src} alt="" fill className="object-cover" sizes="48px" />
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-sm text-[#F5FFFD]">
                  Join community of{" "}
                  <span className="font-semibold text-[#C2FA69]">1,000+</span> merchants.
                </p>
              </div>
            </div>
          </div>

          <div className="overflow-hidden px-6 pb-6 sm:px-10">
            <FooterFitText text="LORESCALE" />
          </div>

          <div className="flex flex-col gap-4 border-t border-white/15 px-6 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-10">
            <div className="flex flex-wrap gap-6">
              <a href="#" className="text-sm text-white/70 transition hover:text-white">
                Privacy Policy
              </a>
              <a href="#" className="text-sm text-white/70 transition hover:text-white">
                Terms
              </a>
            </div>
            <p className="text-sm text-white/50">
              © {new Date().getFullYear()} Lorescale. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
