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
  const dotClass =
    status === "online"
      ? "bg-emerald-500"
      : status === "checking"
        ? "bg-amber-400 animate-pulse"
        : "bg-gray-400";

  const label =
    status === "online"
      ? "AI Online"
      : status === "checking"
        ? "Checking AI…"
        : "AI Offline (API waking?)";

  return (
    <div
      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs font-medium text-gray-700"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} aria-hidden="true" />
      <span className="hidden sm:inline">{label}</span>
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
    <li className="group/item w-full">
      <div className="group/navitem relative w-full rounded-[10px] hover:bg-gray-100/80">
        <Link href={href} className="block w-full rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-gray-950">
          <div
            className={`relative flex w-full items-center gap-2 rounded-[10px] px-2 py-1 transition-colors ${
              active ? "bg-gray-100 text-gray-950" : "text-gray-600 hover:text-gray-950"
            }`}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center">
              <Icon className="h-5 w-5" />
            </div>
            <p className="h-10 truncate text-sm font-medium leading-10">{label}</p>
          </div>
        </Link>
      </div>
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
        className={`flex w-full items-center gap-2 rounded-[10px] border px-2 py-1.5 text-left transition-all focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:outline-none ${
          open
            ? "border-orange-200 bg-orange-50/60 ring-2 ring-orange-500/15"
            : "border-gray-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:border-gray-300 hover:bg-gray-50/80"
        }`}
      >
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-colors ${
            open ? "border-orange-200 bg-orange-100" : "border-gray-200 bg-gray-100"
          }`}
        >
          <BuildingStorefrontIcon
            className={`h-4 w-4 ${open ? "text-orange-600" : "text-gray-600"}`}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-gray-950">{business?.name ?? "Select business"}</p>
          {business?.tagline ? (
            <p className="truncate text-[11px] leading-tight text-gray-500">{business.tagline}</p>
          ) : null}
        </div>
        <ChevronDownIcon
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 ${open ? "rotate-180 text-orange-500" : ""}`}
        />
      </button>

      {open && businesses.length > 0 ? (
        <ul
          role="listbox"
          aria-label="Businesses"
          className="absolute top-[calc(100%+6px)] right-0 left-0 z-30 max-h-56 overflow-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg ring-1 ring-gray-200/80"
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
                    selected ? "bg-gray-100" : "hover:bg-gray-50"
                  }`}
                >
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${
                      selected ? "border-orange-200 bg-orange-100" : "border-gray-200 bg-gray-50"
                    }`}
                  >
                    <BuildingStorefrontIcon
                      className={`h-3.5 w-3.5 ${selected ? "text-orange-600" : "text-gray-500"}`}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`truncate text-sm ${selected ? "font-medium text-gray-950" : "text-gray-700"}`}
                    >
                      {item.name}
                    </p>
                    {item.tagline ? (
                      <p className="truncate text-[11px] leading-tight text-gray-500">{item.tagline}</p>
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
      className="sticky top-0 z-30 flex h-[var(--header-height)] shrink-0 items-center justify-between gap-4 border-b border-gray-200 bg-white/90 px-8 backdrop-blur-md"
      aria-label="Top navigation"
    >
      <div className="flex min-w-0 items-center gap-4">
        <button
          type="button"
          className="hidden items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-500 transition-colors hover:border-gray-300 hover:text-gray-700 focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:outline-none md:flex lg:w-60"
          aria-label="Search"
        >
          <MagnifyingGlassIcon className="h-4 w-4 shrink-0" />
          <span className="truncate">Search</span>
          <kbd className="ml-auto hidden rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-400 lg:inline">
            ⌘K
          </kbd>
        </button>
      </div>

      <nav className="flex shrink-0 items-center gap-3">
        <AiStatusBadge status={aiStatus} />
        {business ? (
          <a
            href={customerAppUrl(business.slug)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:outline-none sm:text-sm"
          >
            <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline">Customer app</span>
          </a>
        ) : null}
        {user ? (
          <div className="hidden items-center gap-2.5 md:flex">
            <p className="max-w-[12rem] truncate text-xs text-gray-500">{user.email}</p>
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100 ring-1 ring-gray-200"
              aria-hidden="true"
            >
              <span className="text-xs font-semibold text-gray-600">{userInitials(user)}</span>
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
    <div className="min-h-screen">
      <aside
        className="fixed top-0 left-0 z-40 flex h-screen w-[var(--sidebar-width)] flex-col border-r border-gray-200 bg-white/90 backdrop-blur-md"
        aria-label="Main navigation"
      >
        <div className="relative flex h-full w-full flex-col overflow-hidden">
          {/* Logo header */}
          <div
            className="relative z-20 flex shrink-0 items-center justify-between px-3"
            style={{ height: "var(--header-height)" }}
          >
            <Link
              href="/"
              className="flex translate-x-2 items-center rounded-md px-2 transition-transform duration-150 focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:outline-none"
            >
              <span className="text-lg font-bold tracking-tight text-orange-500">EVA Admin</span>
            </Link>
          </div>

          <nav className="relative flex min-h-0 flex-1 flex-col">
            {/* Business switcher */}
            <div className="relative z-20 mt-2 w-full shrink-0 px-3.5">
              <BusinessSwitcher
                businesses={businesses}
                business={business}
                onSelect={setBusinessId}
              />
            </div>

            {/* Scrollable nav */}
            <div
              className="mt-4 flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              style={{
                maskImage:
                  "linear-gradient(rgba(255,255,255,0), rgb(255,255,255) 8px, rgb(255,255,255) 100%)",
              }}
            >
              <ul className="flex w-full shrink-0 flex-col gap-1 p-3 pb-0" aria-label="Dashboard navigation">
                {NAV.map(({ href, label, icon }) => (
                  <NavItem key={href} href={href} label={label} icon={icon} active={pathname === href} />
                ))}
              </ul>
            </div>

            {/* Footer */}
            <div className="mt-1 shrink-0 pb-3">
              <div className="px-3">
                <ul className="flex flex-col gap-1">
                  <li className="group/item w-full">
                    <div className="group/navitem relative w-full rounded-[10px] hover:bg-gray-100/80">
                      <button
                        type="button"
                        onClick={() => {
                          logout();
                          router.push("/login");
                        }}
                        className="relative flex w-full items-center gap-2 rounded-[10px] px-2 py-1 text-gray-600 transition-colors hover:text-gray-950 focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:outline-none"
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center">
                          <ArrowRightStartOnRectangleIcon className="h-5 w-5" />
                        </div>
                        <p className="h-10 text-sm font-medium leading-10">Log out</p>
                      </button>
                    </div>
                  </li>
                </ul>
              </div>
            </div>
          </nav>
        </div>
      </aside>

      <div className="ml-[var(--sidebar-width)] flex min-h-screen flex-col">
        <TopNavbar business={business} user={user} />
        <main className="flex-1 p-8">{children}</main>
      </div>
    </div>
  );
}
