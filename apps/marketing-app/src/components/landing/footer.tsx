"use client";

import {
  ChevronRightIcon,
  EnvelopeIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";

import { FlickeringGrid } from "@/components/landing/flickering-grid";
import { LorescaleLogo } from "@/components/landing/lorescale-logo";
import { useMediaQuery } from "@/hooks/use-media-query";
import { adminLoginUrl, adminSignupUrl, demoUrl } from "@/lib/site-links";

const FOOTER_DESCRIPTION =
  "Take the next step toward smarter voice ordering, better customer conversations, and a dashboard that keeps your store running around the clock.";

const SOCIAL_LINKS = [
  {
    id: "instagram",
    label: "Instagram",
    href: "https://instagram.com/lorescale",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="size-4" aria-hidden>
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zm0 10.162a3.999 3.999 0 1 1 0-7.998 3.999 3.999 0 0 1 0 7.998zm6.406-11.845a1.44 1.44 0 1 1-2.881.001 1.44 1.44 0 0 1 2.881-.001z" />
      </svg>
    ),
  },
  {
    id: "x",
    label: "X",
    href: "https://x.com/lorescale",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="size-4" aria-hidden>
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    href: "https://wa.me/6281234567890",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="size-4" aria-hidden>
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
      </svg>
    ),
  },
  {
    id: "telegram",
    label: "Telegram",
    href: "https://t.me/lorescale",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="size-4" aria-hidden>
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
      </svg>
    ),
  },
  {
    id: "email",
    label: "Email",
    href: "mailto:hello@lorescale.com",
    icon: <EnvelopeIcon className="size-4" aria-hidden />,
  },
] as const;

const FOOTER_LINKS = [
  {
    title: "Product",
    links: [
      { id: 1, title: "Features", url: "#features" },
      { id: 2, title: "How it works", url: "#how-it-works" },
      { id: 4, title: "FAQ", url: "#faq" },
    ],
  },
  {
    title: "Platform",
    links: [
      { id: 5, title: "Live demo", url: demoUrl, external: true },
      { id: 6, title: "Sign in", url: adminLoginUrl, external: true },
      { id: 7, title: "Sign up", url: adminSignupUrl, external: true },
    ],
  },
  {
    title: "Company",
    links: [
      { id: 8, title: "Privacy Policy", url: "#" },
      { id: 9, title: "Terms", url: "#" },
      { id: 10, title: "Contact", url: "#" },
    ],
  },
] as const;

export function Footer() {
  const isMobile = useMediaQuery("(max-width: 640px)");
  const isTablet = useMediaQuery("(max-width: 1024px)");

  const fitText = isMobile || isTablet ? "Lorescale" : "LORESCALE";

  return (
    <footer id="footer" className="w-full bg-black pb-0 text-white">
      <div className="landing-container">
        <div className="flex flex-col pt-10 pb-4 sm:px-8 lg:px-10 md:flex-row md:items-start md:justify-between md:pt-10 md:pb-4">
        <div className="mx-0 flex max-w-xs flex-col items-start justify-start gap-y-5">
          <Link href="/" className="flex flex-col items-start gap-1" aria-label="Lorescale">
            <p className="text-xs font-medium uppercase tracking-wide text-white/65">
              PT. LORESCALE DIGITAL INDONESIA
            </p>
            <div className="flex items-center gap-2">
              <LorescaleLogo />
              <span className="text-lg font-semibold tracking-tight text-white">lorescale.</span>
            </div>
          </Link>
          <p className="font-medium tracking-tight text-white/65">{FOOTER_DESCRIPTION}</p>
          <div className="flex items-center gap-2">
            {SOCIAL_LINKS.map((social) => (
              <a
                key={social.id}
                href={social.href}
                target={social.href.startsWith("mailto:") ? undefined : "_blank"}
                rel={social.href.startsWith("mailto:") ? undefined : "noopener noreferrer"}
                aria-label={social.label}
                className="inline-flex items-center justify-center p-1 text-white/65 transition-colors hover:text-white"
              >
                {social.icon}
              </a>
            ))}
          </div>
        </div>
        <div className="pt-5 md:w-1/2 md:pt-0">
          <div className="flex flex-col items-start justify-start gap-y-5 md:flex-row md:items-start md:justify-between lg:pl-10">
            {FOOTER_LINKS.map((column) => (
              <ul key={column.title} className="flex flex-col gap-y-2">
                <li className="mb-2 text-sm font-semibold text-white">{column.title}</li>
                {column.links.map((link) => (
                  <li
                    key={link.id}
                    className="group inline-flex cursor-pointer items-center justify-start gap-1 text-[15px]/snug text-white/65 transition-colors hover:text-white"
                  >
                    {"external" in link && link.external ? (
                      <a href={link.url} target="_blank" rel="noopener noreferrer">
                        {link.title}
                      </a>
                    ) : (
                      <Link href={link.url}>{link.title}</Link>
                    )}
                    <div className="flex size-4 translate-x-0 transform items-center justify-center rounded border border-white/20 opacity-0 transition-all duration-300 ease-out group-hover:translate-x-1 group-hover:opacity-100">
                      <ChevronRightIcon className="h-4 w-4 text-white" aria-hidden />
                    </div>
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>
        </div>
      </div>
      <div className="relative z-0 mt-2 h-44 w-full sm:mt-4 sm:h-56 md:h-80">
        <div className="absolute inset-0">
          <FlickeringGrid
            text={fitText}
            fontSize={210}
            fitText
            minFontSize={44}
            textYRatio={isMobile ? 0.72 : 0.68}
            className="h-full w-full"
            squareSize={2}
            gridGap={isMobile ? 2 : isTablet ? 2 : 3}
            color="#9CA3AF"
            maxOpacity={0.35}
            flickerChance={0.1}
          />
        </div>
        <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-transparent to-black from-40%" />
        <span className="sr-only">{fitText}</span>
      </div>
      <div className="relative z-20 border-t border-dashed border-white/10">
        <div className="landing-container border-x border-dashed border-white/10">
          <div className="flex items-center justify-between gap-4 py-4 sm:px-8 lg:px-10">
            <p className="text-xs font-medium text-neutral-500">
              Copyright © {new Date().getFullYear()} Lorescale{" "}
              <span className="hidden sm:inline">Seluruh hak cipta dilindungi.</span>
            </p>
            <Link
              href="#"
              className="shrink-0 text-xs font-medium text-neutral-500 transition-colors hover:text-neutral-300"
            >
              Terms & Conditions
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
