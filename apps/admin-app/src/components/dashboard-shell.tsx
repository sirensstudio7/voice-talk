"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import {
  ArrowRightOnRectangleIcon,
  ArrowTopRightOnSquareIcon,
  ArrowUpRightIcon,
  BookOpenIcon,
  BuildingOffice2Icon,
  CalendarDaysIcon,
  CameraIcon,
  ComputerDesktopIcon,
  ChartBarIcon,
  ChatBubbleLeftRightIcon,
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
  PlusIcon,
  PuzzlePieceIcon,
  Cog6ToothIcon,
  MagnifyingGlassIcon,
  QrCodeIcon,
  QueueListIcon,
  BanknotesIcon,
  ReceiptPercentIcon,
  PresentationChartBarIcon,
  SparklesIcon,
  Squares2X2Icon,
  SwatchIcon,
} from "@heroicons/react/24/outline";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { adminPath, matchAdminPath, stripBusinessSlug } from "@/lib/admin-path";
import { rememberAddonStatuses } from "@/lib/addon-status-cache";
import { api, getHealth, type Business } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { customerAppUrl } from "@/lib/customer-app";

type IconComponent = ComponentType<{ className?: string }>;

type AiStatus = "checking" | "online" | "offline";

type NavItem = {
  href: string;
  label: string;
  icon: IconComponent;
  requiresMenu?: boolean;
  requiresOrdering?: boolean;
  requiresBooking?: boolean;
  requiresAiPresenter?: boolean;
  salonLabel?: string;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

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
  "/kiosks": "Kiosks",
  "/billing": "Billing",
  "/transactions": "Transactions",
  "/workspaces": "Workspaces",
  "/settings": "Settings",
  "/add-ons": "Add On",
  "/add-ons/smart-photo-moment": "Smart Photo Moment",
  "/add-ons/smart-photo-moment/payment": "Checkout",
  "/add-ons/lucky-spin": "Lucky Spin",
  "/add-ons/lucky-spin/payment": "Checkout",
  "/add-ons/ai-presenter": "AI Presenter",
  "/add-ons/ai-presenter/payment": "Checkout",
  "/add-ons/campaign-banner": "Campaign Banner",
  "/add-ons/campaign-banner/payment": "Checkout",
  "/add-ons/language-pack": "Language Pack",
  "/add-ons/language-pack/payment": "Checkout",
  "/add-ons/live": "LORESCALE LIVE",
  "/add-ons/live/payment": "Checkout",
  "/add-ons/booking": "Booking",
  "/add-ons/booking/payment": "Checkout",
};

function breadcrumbLabel(pathname: string, businessSlug?: string | null) {
  const path = stripBusinessSlug(pathname, businessSlug);
  if (ROUTE_LABELS[path]) return ROUTE_LABELS[path];
  if (/^\/knowledge\/[^/]+\/edit$/.test(path)) return "Edit entry";
  if (/^\/presentations\/[^/]+$/.test(path)) return "Presentation";
  if (/^\/presentations\/[^/]+\/preview$/.test(path)) return "Preview";
  if (/^\/presentations\/[^/]+\/focus$/.test(path)) return "In focus";
  if (/^\/sessions\/[^/]+\/live$/.test(path)) return "Live session";
  if (/^\/add-ons\/live\/[^/]+$/.test(path)) return "Control Room";
  return path.split("/").filter(Boolean).pop()?.replace(/-/g, " ") ?? "";
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/", label: "Overview", icon: Squares2X2Icon },
      { href: "/analytics", label: "Analytics", icon: ChartBarIcon },
    ],
  },
  {
    label: "Operations",
    items: [
      {
        href: "/menu",
        label: "Menu",
        icon: QueueListIcon,
        requiresMenu: true,
        salonLabel: "Treatments",
      },
      {
        href: "/appointments",
        label: "Appointments",
        icon: CalendarDaysIcon,
        requiresBooking: true,
      },
      { href: "/schedule", label: "Schedule", icon: ClockIcon, requiresBooking: true },
      { href: "/orders", label: "Orders", icon: ReceiptPercentIcon, requiresOrdering: true },
      { href: "/payment", label: "Payment QR", icon: QrCodeIcon, requiresOrdering: true },
    ],
  },
  {
    label: "AI Assistant",
    items: [
      { href: "/knowledge", label: "AI Knowledge", icon: BookOpenIcon },
      {
        href: "/presentations",
        label: "AI Presenter",
        icon: PresentationChartBarIcon,
        requiresAiPresenter: true,
      },
      { href: "/ai-rules", label: "AI Rules", icon: SparklesIcon },
      { href: "/vision-settings", label: "Vision Settings", icon: CameraIcon },
    ],
  },
  {
    label: "Engagement",
    items: [
      { href: "/conversations", label: "Conversations", icon: ChatBubbleLeftRightIcon },
      { href: "/appearance", label: "Appearance", icon: SwatchIcon },
      { href: "/kiosks", label: "Kiosks", icon: ComputerDesktopIcon },
    ],
  },
  {
    label: "Add On",
    items: [{ href: "/add-ons", label: "Add On", icon: PuzzlePieceIcon }],
  },
];

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

function BusinessSwitcher({
  businesses,
  business,
  onSelect,
}: {
  businesses: Business[];
  business: Business | null;
  onSelect: (id: string) => void;
}) {
  const router = useRouter();
  const { token } = useAuth();
  const [canCreate, setCanCreate] = useState(true);
  const label = business?.name ?? "Select business";

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void api
      .getSubscription(token)
      .then((sub) => {
        if (!cancelled) setCanCreate(sub.can_create_workspace);
      })
      .catch(() => {
        if (!cancelled) setCanCreate(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token, businesses.length]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          size="lg"
          tooltip={label}
          className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
        >
          <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <BuildingOffice2Icon className="size-4" />
          </div>
          <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
            <span className="truncate font-semibold">{label}</span>
            <span className="truncate text-xs text-sidebar-foreground/70">
              {business?.tagline ?? "Lorescale Admin"}
            </span>
          </div>
          <ChevronDownIcon className="ml-auto size-4 shrink-0 text-sidebar-foreground/70" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-[--radix-dropdown-menu-trigger-width] min-w-56"
        align="start"
        side="bottom"
        sideOffset={4}
      >
        <DropdownMenuLabel className="text-xs text-muted-foreground">Businesses</DropdownMenuLabel>
        {businesses.map((item) => {
          const selected = item.id === business?.id;
          return (
            <DropdownMenuItem
              key={item.id}
              onSelect={() => onSelect(item.id)}
              className="gap-2 p-2"
            >
              <div className="flex size-6 shrink-0 items-center justify-center rounded-md border">
                <BuildingOffice2Icon className="size-3.5 shrink-0" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{item.name}</p>
                {item.tagline ? (
                  <p className="truncate text-xs text-muted-foreground">{item.tagline}</p>
                ) : null}
              </div>
              {selected ? <CheckIcon className="ml-auto size-4 shrink-0" /> : null}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            if (canCreate) {
              router.push("/onboarding/workspace?new=1");
            } else {
              router.push("/billing");
            }
          }}
          className="gap-2 p-2"
        >
          <div className="flex size-6 shrink-0 items-center justify-center rounded-md border border-dashed">
            <PlusIcon className="size-3.5 shrink-0" />
          </div>
          <span className="font-medium">{canCreate ? "New workspace" : "Upgrade to add workspace"}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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

function userDisplayName(user: { name?: string; email: string }) {
  const name = user.name?.trim();
  if (name) return name;
  const local = user.email.split("@")[0]?.trim();
  return local || "Account";
}

function UserMenu({
  user,
  onLogout,
}: {
  user: { name?: string; email: string };
  onLogout: () => void;
}) {
  const router = useRouter();
  const { token } = useAuth();
  const [planLabel, setPlanLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void api
      .getSubscription(token)
      .then((sub) => {
        if (cancelled) return;
        const label =
          sub.status === "trialing"
            ? "Trial"
            : sub.plan_name?.replace(/\s*Plan$/i, "") || sub.plan_code;
        setPlanLabel(label);
      })
      .catch(() => {
        if (!cancelled) setPlanLabel(null);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="hidden items-center gap-2.5 rounded-md px-1 py-1 outline-none hover:bg-transparent focus:outline-none focus-visible:outline-none focus-visible:ring-0 md:flex"
        >
          <div className="flex min-w-0 flex-col items-end gap-0.5">
            <div className="flex min-w-0 max-w-[14rem] items-center gap-1.5">
              {planLabel ? (
                <span className="inline-flex shrink-0 truncate rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold leading-none text-foreground">
                  {planLabel}
                </span>
              ) : null}
              <span className="truncate text-sm font-medium leading-none text-foreground">
                {userDisplayName(user)}
              </span>
            </div>
            {user.email ? (
              <p className="max-w-[14rem] truncate text-xs text-muted-foreground">{user.email}</p>
            ) : null}
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
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex min-w-0 items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
              {userDisplayName(user)}
            </p>
            {planLabel ? (
              <span className="inline-flex shrink-0 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold leading-none text-foreground">
                {planLabel}
              </span>
            ) : null}
          </div>
          {user.email ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{user.email}</p>
          ) : null}
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
          <ArrowRightOnRectangleIcon />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function isFullscreenRoute(pathname: string, businessSlug?: string | null) {
  const path = stripBusinessSlug(pathname, businessSlug);
  return (
    /^\/presentations\/[^/]+\/preview$/.test(path) ||
    /^\/presentations\/[^/]+\/focus$/.test(path) ||
    /^\/sessions\/[^/]+\/live$/.test(path)
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, businesses, business, setBusinessId, logout, token } = useAuth();
  const aiStatus = useAiStatus();
  const [aiPresenterActive, setAiPresenterActive] = useState(false);
  const [bookingAddonActive, setBookingAddonActive] = useState(false);
  const slug = business?.slug ?? "";
  const pathSuffix = stripBusinessSlug(pathname, slug || null);
  const orderingEnabled = business?.capabilities?.ordering_enabled ?? true;
  const menuEnabled = business?.capabilities?.menu_enabled ?? orderingEnabled;
  const bookingEnabled = business?.capabilities?.booking_enabled ?? false;
  const salonMode = business?.capabilities?.salon_mode ?? false;
  const fullscreen = isFullscreenRoute(pathname, slug || null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!token || !business?.id) {
        setAiPresenterActive(false);
        setBookingAddonActive(false);
        return;
      }
      try {
        const statuses = await api.listAddonStatuses(token, business.id);
        if (cancelled) return;
        rememberAddonStatuses(business.id, statuses);
        const presenter = statuses.find((item) => item.addon.code === "ai_presenter");
        setAiPresenterActive(presenter?.subscription_status === "active");
        const booking = statuses.find((item) => item.addon.code === "booking");
        setBookingAddonActive(booking?.subscription_status === "active");
      } catch {
        try {
          const status = await api.getAddonStatus(token, business.id, "ai_presenter");
          if (!cancelled) {
            setAiPresenterActive(status.subscription_status === "active");
          }
        } catch {
          if (!cancelled) setAiPresenterActive(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, business?.id]);

  const navGroups = useMemo(
    () =>
      NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items
          .filter((item) => {
            if (item.requiresOrdering && !orderingEnabled) return false;
            if (item.requiresBooking && !bookingEnabled && !bookingAddonActive) return false;
            if (item.requiresMenu && !menuEnabled) return false;
            if (item.requiresAiPresenter && !aiPresenterActive) return false;
            return true;
          })
          .map((item) => ({
            ...item,
            href: slug ? adminPath(slug, item.href) : item.href,
            label:
              item.href === "/menu" && salonMode && item.salonLabel ? item.salonLabel : item.label,
            suffix: item.href,
          })),
      })).filter((group) => group.items.length > 0),
    [orderingEnabled, menuEnabled, bookingEnabled, bookingAddonActive, salonMode, slug, aiPresenterActive],
  );

  const handleBusinessSelect = (id: string) => {
    const next = businesses.find((item) => item.id === id);
    setBusinessId(id);
    if (!next?.slug) return;

    const currentSlug = business?.slug;
    if (currentSlug && (pathname === `/${currentSlug}` || pathname.startsWith(`/${currentSlug}/`))) {
      router.push(adminPath(next.slug, pathSuffix));
    }
  };

  // Preview opens full-page (no sidebar) while keeping the white admin vibe.
  if (fullscreen) {
    return <div className="min-h-svh bg-background text-foreground">{children}</div>;
  }

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <BusinessSwitcher
                businesses={businesses}
                business={business}
                onSelect={handleBusinessSelect}
              />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          {navGroups.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map(({ href, label, icon: Icon, suffix }) => (
                    <SidebarMenuItem key={suffix}>
                      <SidebarMenuButton
                        asChild
                        isActive={slug ? matchAdminPath(pathname, slug, suffix) : pathname === href}
                        tooltip={label}
                      >
                        <Link href={href}>
                          <Icon />
                          <span>{label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}

          <SidebarGroup>
            <SidebarGroupLabel>Quick links</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {business ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild tooltip="Customer app">
                      <a
                        href={customerAppUrl(business.slug)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ArrowTopRightOnSquareIcon />
                        <span>Customer app</span>
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="Search">
                    <MagnifyingGlassIcon />
                    <span>Search</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>

      <SidebarInset>
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
        <div className="@container/main flex flex-1 flex-col gap-2">
          <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
            <div className="flex flex-col gap-4 px-4 lg:px-6 md:gap-6">{children}</div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
