"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowUpRightIcon,
  BanknotesIcon,
  BuildingOffice2Icon,
  ChevronDownIcon,
  Cog6ToothIcon,
  ReceiptPercentIcon,
} from "@heroicons/react/24/outline";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Separator,
  SidebarTrigger,
} from "@voicetalk/ui";
import { adminPath, stripBusinessSlug } from "@/lib/admin-path";
import { useAuth } from "@/lib/auth";
import { UserMenu } from "./UserMenu";
import { customerAppUrl } from "@/lib/customer-app";

type AiStatus = "checking" | "online" | "offline";

function useAiStatus() {
  const [status, setStatus] = useState<AiStatus>("checking");

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch(process.env.NEXT_PUBLIC_API_URL + "/health" || "http://localhost:8000/health");
        if (res.ok) {
          const health = await res.json();
          if (!cancelled) setStatus(health.ai_online ? "online" : "offline");
        } else {
          if (!cancelled) setStatus("offline");
        }
      } catch {
        if (!cancelled) setStatus("offline");
      }
    };

    void check();
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
          dotClass: "bg-green-400",
          label: "AI Online",
          badgeClass: "border-green-100 bg-green-50/80 text-green-600",
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

const ROUTE_LABELS: Record<string, string> = {
  "/": "Overview",
  "/analytics": "Analytics",
  "/menu": "Menu",
  "/appointments": "Appointments",
  "/schedule": "Schedule",
  "/orders": "Orders",
  "/payment": "Payment QR",
  "/knowledge": "AI Knowledge",
  "/knowledge/new": "Add entry",
  "/presentations": "AI Presenter",
  "/ai-rules": "AI Rules",
  "/vision-settings": "Vision Settings",
  "/conversations": "Conversations",
  "/appearance": "Appearance",
  "/billing": "Billing",
  "/transactions": "Transactions",
  "/workspaces": "Workspaces",
  "/settings": "Settings",
  "/add-ons": "Add On",
};

function breadcrumbLabel(pathname: string, businessSlug?: string | null) {
  const path = stripBusinessSlug(pathname, businessSlug);
  if (ROUTE_LABELS[path]) return ROUTE_LABELS[path];
  if (/^\/knowledge\/[^/]+\/edit$/.test(path)) return "Edit entry";
  if (/^\/presentations\/[^/]+$/.test(path)) return "Presentation";
  if (/^\/presentations\/[^/]+\/preview$/.test(path)) return "Preview";
  if (/^\/presentations\/[^/]+\/focus$/.test(path)) return "In focus";
  if (/^\/sessions\/[^/]+\/live$/.test(path)) return "Live session";
  return path.split("/").filter(Boolean).pop()?.replace(/-/g, " ") ?? "";
}


  user: { name?: string; email: string };
  onLogout: () => void;
}) {
  const router = useRouter();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="hidden items-center gap-2.5 rounded-md px-1 py-1 outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring md:flex"
        >
          <div className="flex min-w-0 flex-col items-end gap-0.5">
            <p className="max-w-[12rem] truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
          <div
            className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-orange-400 to-orange-500"
            aria-hidden="true"
          >
            <span className="text-xs font-semibold text-white">{userInitials(user)}</span>
          </div>
          <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push("/workspaces")}>
          <BuildingOffice2Icon />
          Workspace
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push("/billing")}>
          <ReceiptPercentIcon />
          Billing
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push("/transactions")}>
          <BanknotesIcon />
          Transactions
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push("/settings")}>
          <Cog6ToothIcon />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            onLogout();
            router.push("/login");
          }}
        >
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppHeader() {
  const pathname = usePathname();
  const { user, business, logout } = useAuth();
  const aiStatus = useAiStatus();
  
  const slug = business?.slug ?? "";
  const pathSuffix = stripBusinessSlug(pathname, slug || null);

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background transition-[width,height] ease-linear">
      <div className="flex min-w-0 flex-1 items-center gap-2 px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 hidden h-4 sm:block" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href={slug ? adminPath(slug, "/") : "/"}>Dashboard</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            {pathSuffix !== "/" ? (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>
                    {breadcrumbLabel(pathname, slug || null)}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </>
            ) : null}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <div className="flex shrink-0 items-center gap-2.5 px-4">
        <AiStatusBadge status={aiStatus} />
        {business ? (
          <Button variant="outline" size="sm" asChild className="hidden sm:inline-flex">
            <a href={customerAppUrl(business.slug)} target="_blank" rel="noopener noreferrer">
              <ArrowUpRightIcon />
              Customer app
            </a>
          </Button>
        ) : null}
        {user ? (
          <UserMenu
            user={user}
            onLogout={() => {
              logout();
            }}
          />
        ) : null}
      </div>
    </header>
  );
}
