import Link from "next/link";
import { Mic } from "lucide-react";

import { adminLoginUrl, demoUrl } from "@/lib/site-links";

const NAV_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

export function Navbar() {
  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div className="glass-nav mx-auto flex h-16 max-w-6xl items-center justify-between border-b border-black/[0.04] px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2 text-[#181818]">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 ring-1 ring-black/[0.06]">
            <Mic className="h-4 w-4" aria-hidden />
          </span>
          <span className="text-lg font-semibold tracking-tight">Lore</span>
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
            href={demoUrl}
            className="hidden rounded-full px-4 py-2 text-sm font-medium text-[#46484d] transition hover:text-[#181818] sm:inline-flex"
          >
            Live demo
          </a>
          <a
            href={adminLoginUrl}
            className="inline-flex items-center rounded-full bg-[#181818] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#2a2a2a]"
          >
            Get started
          </a>
        </div>
      </div>
    </header>
  );
}
