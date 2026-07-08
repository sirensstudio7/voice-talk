"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ComponentType, type SVGProps } from "react";
import {
  ArrowRightStartOnRectangleIcon,
  ArrowTopRightOnSquareIcon,
  BookOpenIcon,
  BuildingStorefrontIcon,
  ChartBarIcon,
  ChatBubbleLeftRightIcon,
  CheckIcon,
  ChevronDownIcon,
  QueueListIcon,
  ReceiptPercentIcon,
  MagnifyingGlassIcon,
  PhotoIcon,
  QrCodeIcon,
  SparklesIcon,
  Squares2X2Icon,
} from "@heroicons/react/24/outline";

import { getHealth, type Business } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { customerAppUrl } from "@/lib/customer-app";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

type AiStatus = "checking" | "online" | "offline";

function useAiStatus() {
  const [status, setStatus] = useState<AiStatus>("checking");

  useEffect(() => {
    let cancelled = false;

    const check = () => {
      void getHealth()
        .then((health) => {
          if (!cancelled) setStatus(health.ai_online ? "online" : "offline");
        })
        .catch(() => {
          if (!cancelled) setStatus("offline");
        });
    };

    check();
    const interval = window.setInterval(check, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  return status;
}

function AiStatusBadge({ status }: { status: AiStatus }) {
  const config =
    status === "online"
      ? {
          dotClass: "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]",
          label: "AI Online",
          badgeClass: "border-emerald-200/80 bg-emerald-50 text-emerald-700",
        }
      : status === "checking"
        ? {
            dotClass: "bg-amber-400 animate-pulse",
            label: "Checking AI…",
            badgeClass: "border-amber-200/80 bg-amber-50 text-amber-700",
          }
        : {
            dotClass: "bg-slate-400",
            label: "AI Offline (API waking?)",
            badgeClass: "border-slate-200 bg-slate-50 text-slate-600",
          };

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${config.badgeClass}`}
      role="status"
      aria-live="polite"
      aria-label={config.label}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${config.dotClass}`} aria-hidden="true" />
      <span className="hidden sm:inline">{config.label}</span>
    </div>
  );
}

const NAV = [
  { href: "/", label: "Overview", icon: Squares2X2Icon },
  { href: "/menu", label: "Menu", icon: QueueListIcon },
  { href: "/knowledge", label: "AI Knowledge", icon: BookOpenIcon },
  { href: "/ai-rules", label: "AI Rules", icon: SparklesIcon },
  { href: "/orders", label: "Orders", icon: ReceiptPercentIcon },
  { href: "/conversations", label: "Conversations", icon: ChatBubbleLeftRightIcon },
  { href: "/payment", label: "Payment QR", icon: QrCodeIcon },
  { href: "/appearance", label: "Appearance", icon: PhotoIcon },
  { href: "/analytics", label: "Analytics", icon: ChartBarIcon },
];

function NavItem({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: IconComponent;
  active: boolean;
}) {
  return (
    <li className="w-full">
      <Link
        href={href}
        className={`group flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40 focus-visible:ring-offset-2 ${
          active
            ? "bg-orange-50 text-orange-700 shadow-sm ring-1 ring-orange-100"
            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
        }`}
      >
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
            active ? "bg-orange-100 text-orange-600" : "text-slate-500 group-hover:text-slate-700"
          }`}
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <span className="truncate">{label}</span>
      </Link>
    </li>
  );
}

function BusinessSwitcher({
  businesses,
  business,
  onSelect,
}: {
  businesses: Business[];
  business: Business | null;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Select business"
        onClick={() => setOpen((current) => !current)}
        className={`flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-all outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40 focus-visible:ring-offset-2 ${
          open
            ? "border-orange-200 bg-orange-50/50 shadow-sm ring-2 ring-orange-500/10"
            : "border-slate-200 bg-white shadow-sm hover:border-slate-300 hover:bg-slate-50/50"
        }`}
      >
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
            open ? "bg-orange-100 text-orange-600" : "bg-slate-100 text-slate-600"
          }`}
        >
          <BuildingStorefrontIcon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">
            {business?.name ?? "Select business"}
          </p>
          {business?.tagline ? (
            <p className="truncate text-[11px] leading-tight text-slate-500">{business.tagline}</p>
          ) : null}
        </div>
        <ChevronDownIcon
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${open ? "rotate-180 text-orange-500" : ""}`}
        />
      </button>

      {open && businesses.length > 0 ? (
        <ul
          role="listbox"
          aria-label="Businesses"
          className="absolute top-[calc(100%+6px)] right-0 left-0 z-30 max-h-56 overflow-auto rounded-xl border border-slate-200 bg-white py-1.5 shadow-lg shadow-slate-200/50 ring-1 ring-slate-100"
        >
          {businesses.map((item) => {
            const selected = item.id === business?.id;
            return (
              <li key={item.id} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(item.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2.5 px-2.5 py-2 text-left transition-colors ${
                    selected ? "bg-orange-50" : "hover:bg-slate-50"
                  }`}
                >
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                      selected ? "bg-orange-100 text-orange-600" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    <BuildingStorefrontIcon className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`truncate text-sm ${selected ? "font-semibold text-slate-900" : "text-slate-700"}`}
                    >
                      {item.name}
                    </p>
                    {item.tagline ? (
                      <p className="truncate text-[11px] leading-tight text-slate-500">{item.tagline}</p>
                    ) : null}
                  </div>
                  {selected ? <CheckIcon className="h-4 w-4 shrink-0 text-orange-500" /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function userInitials(user: { name?: string; email: string }) {
  if (user.name?.trim()) {
    return user.name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
  }

  return user.email[0]?.toUpperCase() ?? "?";
}

function TopNavbar({
  business,
  user,
}: {
  business: { name: string; slug: string } | null;
  user: { name?: string; email: string } | null;
}) {
  const aiStatus = useAiStatus();

  return (
    <header
      className="sticky top-0 z-30 flex h-[var(--header-height)] shrink-0 items-center justify-between gap-4 border-b border-slate-200/80 bg-white/80 px-6 backdrop-blur-xl lg:px-8"
      aria-label="Top navigation"
    >
      <div className="flex min-w-0 items-center gap-4">
        <button
          type="button"
          className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-2 text-sm text-slate-500 transition-colors hover:border-slate-300 hover:bg-white hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-orange-500/40 focus-visible:outline-none md:flex lg:w-60"
          aria-label="Search"
        >
          <MagnifyingGlassIcon className="h-4 w-4 shrink-0" />
          <span className="truncate">Search</span>
          <kbd className="ml-auto hidden rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-400 lg:inline">
            ⌘K
          </kbd>
        </button>
      </div>

      <nav className="flex shrink-0 items-center gap-2.5 sm:gap-3">
        <AiStatusBadge status={aiStatus} />
        {business ? (
          <a
            href={customerAppUrl(business.slug)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-orange-500/40 focus-visible:outline-none sm:text-sm"
          >
            <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline">Customer app</span>
          </a>
        ) : null}
        {user ? (
          <div className="hidden items-center gap-2.5 md:flex">
            <p className="max-w-[12rem] truncate text-xs text-slate-500">{user.email}</p>
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-orange-400 to-orange-500 shadow-sm shadow-orange-500/20"
              aria-hidden="true"
            >
              <span className="text-xs font-semibold text-white">{userInitials(user)}</span>
            </div>
          </div>
        ) : null}
      </nav>
    </header>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, businesses, business, setBusinessId, logout } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50">
      <aside
        className="fixed top-0 left-0 z-40 flex h-screen w-[var(--sidebar-width)] flex-col border-r border-slate-200/80 bg-white"
        aria-label="Main navigation"
      >
        <div className="relative flex h-full w-full flex-col overflow-hidden">
          <div
            className="relative z-20 flex shrink-0 items-center px-4"
            style={{ height: "var(--header-height)" }}
          >
            <Link
              href="/"
              className="flex items-center gap-2.5 rounded-xl px-1 py-1 transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-orange-500/40 focus-visible:outline-none"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500 shadow-sm shadow-orange-500/25">
                <SparklesIcon className="h-4 w-4 text-white" />
              </div>
              <span className="text-base font-semibold tracking-tight text-slate-900">
                EVA <span className="text-orange-500">Admin</span>
              </span>
            </Link>
          </div>

          <nav className="relative flex min-h-0 flex-1 flex-col">
            <div className="relative z-20 w-full shrink-0 px-3">
              <BusinessSwitcher
                businesses={businesses}
                business={business}
                onSelect={setBusinessId}
              />
            </div>

            <div
              className="mt-3 flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto scroll-smooth px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              style={{
                maskImage:
                  "linear-gradient(rgba(255,255,255,0), rgb(255,255,255) 8px, rgb(255,255,255) 100%)",
              }}
            >
              <ul className="flex w-full shrink-0 flex-col gap-0.5 pb-2" aria-label="Dashboard navigation">
                {NAV.map(({ href, label, icon }) => (
                  <NavItem key={href} href={href} label={label} icon={icon} active={pathname === href} />
                ))}
              </ul>
            </div>

            <div className="shrink-0 border-t border-slate-100 px-3 py-3">
              <button
                type="button"
                onClick={() => {
                  logout();
                  router.push("/login");
                }}
                className="group flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-orange-500/40 focus-visible:outline-none"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 group-hover:text-slate-700">
                  <ArrowRightStartOnRectangleIcon className="h-[18px] w-[18px]" />
                </span>
                <span>Log out</span>
              </button>
            </div>
          </nav>
        </div>
      </aside>

      <div className="ml-[var(--sidebar-width)] flex min-h-screen flex-col">
        <TopNavbar business={business} user={user} />
        <main className="flex-1 p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
