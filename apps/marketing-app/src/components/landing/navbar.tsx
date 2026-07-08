import Link from "next/link";

import { adminLoginUrl } from "@/lib/site-links";

const NAV_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

export function Navbar() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-dashed border-black/[0.06] bg-white">
      <div className="landing-container flex h-16 items-center justify-between">
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

        <div className="flex items-center gap-2 sm:gap-3">
          <a
            href={adminLoginUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center rounded-full bg-[#181818] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#2a2a2a]"
          >
            Get started
          </a>
        </div>
      </div>
    </header>
  );
}
