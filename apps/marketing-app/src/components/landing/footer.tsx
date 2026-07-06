import Link from "next/link";
import { Mic } from "lucide-react";

import { adminLoginUrl, demoUrl } from "@/lib/site-links";

const FOOTER_LINKS = [
  { href: demoUrl, label: "Live demo", external: true },
  { href: adminLoginUrl, label: "Admin", external: true },
  { href: "#features", label: "Features", external: false },
  { href: "#pricing", label: "Pricing", external: false },
  { href: "#faq", label: "FAQ", external: false },
  { href: "#", label: "Privacy", external: false },
  { href: "#", label: "Terms", external: false },
];

export function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Link href="/" className="flex items-center gap-2 text-slate-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500 text-white">
                <Mic className="h-4 w-4" aria-hidden />
              </span>
              <span className="text-lg font-semibold">Lore</span>
            </Link>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-slate-600">
              AI voice cashier for modern food & beverage businesses.
            </p>
          </div>

          <nav className="flex flex-wrap gap-x-6 gap-y-2">
            {FOOTER_LINKS.map(({ href, label, external }) =>
              external ? (
                <a
                  key={label}
                  href={href}
                  className="text-sm text-slate-600 transition hover:text-slate-900"
                >
                  {label}
                </a>
              ) : (
                <a
                  key={label}
                  href={href}
                  className="text-sm text-slate-600 transition hover:text-slate-900"
                >
                  {label}
                </a>
              ),
            )}
          </nav>
        </div>

        <p className="mt-10 border-t border-slate-200 pt-6 text-sm text-slate-500">
          © {new Date().getFullYear()} Lore. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
