"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, type ComponentType, type ReactNode } from "react";
import {
  ArrowRightOnRectangleIcon,
  BuildingOffice2Icon,
  ChevronDownIcon,
  ClipboardDocumentCheckIcon,
  ClipboardDocumentListIcon,
  ClockIcon,
  Cog6ToothIcon,
  CreditCardIcon,
  CubeTransparentIcon,
  PresentationChartBarIcon,
  PuzzlePieceIcon,
  Squares2X2Icon,
  UsersIcon,
} from "@heroicons/react/24/outline";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
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
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";

type IconComponent = ComponentType<{ className?: string }>;

type NavItem = {
  href: string;
  label: string;
  icon: IconComponent;
  pendingFilter?: boolean;
  demoRequestsBadge?: boolean;
  subscriptionRequestsBadge?: boolean;
};

type NavGroup = { label: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [{ href: "/", label: "Dashboard", icon: Squares2X2Icon }],
  },
  {
    label: "Customers",
    items: [
      { href: "/users", label: "Users", icon: UsersIcon },
      {
        href: "/users?status=pending",
        label: "Pending",
        icon: ClockIcon,
        pendingFilter: true,
      },
      { href: "/businesses", label: "Workspaces", icon: BuildingOffice2Icon },
      { href: "/subscriptions", label: "Subscriptions", icon: CreditCardIcon },
      {
        href: "/subscription-requests",
        label: "Plan requests",
        icon: ClipboardDocumentCheckIcon,
        subscriptionRequestsBadge: true,
      },
      {
        href: "/addon-requests",
        label: "Add-on requests",
        icon: PuzzlePieceIcon,
      },
      {
        href: "/demo-requests",
        label: "Demo requests",
        icon: PresentationChartBarIcon,
        demoRequestsBadge: true,
      },
    ],
  },
  {
    label: "Platform",
    items: [
      { href: "/avatar-pose", label: "Avatar pose", icon: CubeTransparentIcon },
      { href: "/settings", label: "Settings", icon: Cog6ToothIcon },
      { href: "/audit-logs", label: "Audit Logs", icon: ClipboardDocumentListIcon },
    ],
  },
];

const ROUTE_LABELS: Record<string, string> = {
  "/": "Dashboard",
  "/users": "Users",
  "/businesses": "Workspaces",
  "/subscriptions": "Subscriptions",
  "/subscription-requests": "Plan requests",
  "/addon-requests": "Add-on requests",
  "/demo-requests": "Demo requests",
  "/avatar-pose": "Avatar pose",
  "/settings": "Settings",
  "/audit-logs": "Audit Logs",
};

function breadcrumbLabel(pathname: string) {
  if (ROUTE_LABELS[pathname]) return ROUTE_LABELS[pathname];
  if (pathname.startsWith("/users/")) return "User detail";
  if (pathname.startsWith("/businesses/")) return "Workspace detail";
  if (pathname.startsWith("/avatar-pose/clips/")) return "Clip";
  return pathname.split("/").filter(Boolean).pop()?.replace(/-/g, " ") ?? "";
}

function isActive(pathname: string, href: string, statusFilter: string | null, pendingFilter?: boolean) {
  if (pendingFilter) {
    return pathname === "/users" && statusFilter === "pending";
  }
  if (href === "/") return pathname === "/";
  if (href === "/users") {
    return (pathname === "/users" && statusFilter !== "pending") || pathname.startsWith("/users/");
  }
  if (href === "/avatar-pose") {
    return pathname === "/avatar-pose" || pathname.startsWith("/avatar-pose/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
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

function BrandHeader({ role }: { role?: string }) {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" className="pointer-events-none">
          <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <BuildingOffice2Icon className="size-4" />
          </div>
          <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
            <span className="truncate font-semibold">Lorescale</span>
            <span className="truncate text-xs capitalize text-sidebar-foreground/70">
              {role ? `${role} admin` : "Super Admin"}
            </span>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function UserMenu({
  user,
  onLogout,
}: {
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
          <p className="max-w-[12rem] truncate text-xs text-muted-foreground">{user.email}</p>
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
          <p className="truncate text-sm font-medium">{user.name || "Admin"}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
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

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const statusFilter = searchParams.get("status");
  const { admin, logout, token, authReady } = useAuth();
  const [pendingUsers, setPendingUsers] = useState(0);
  const [newDemoRequests, setNewDemoRequests] = useState(0);
  const [pendingSubRequests, setPendingSubRequests] = useState(0);

  const loadPendingUsers = useCallback(async () => {
    if (!token) return;
    try {
      const result = await api.listUsers(token, { status: "pending", limit: 1, page: 1 });
      setPendingUsers(result.total);
    } catch {
      setPendingUsers(0);
    }
  }, [token]);

  const loadNewDemoRequests = useCallback(async () => {
    if (!token) return;
    try {
      const result = await api.listDemoRequests(token, { status: "new", limit: 1, page: 1 });
      setNewDemoRequests(result.total);
    } catch {
      setNewDemoRequests(0);
    }
  }, [token]);

  const loadPendingSubRequests = useCallback(async () => {
    if (!token) return;
    try {
      const result = await api.listSubscriptionRequests(token, {
        status: "pending",
        limit: 1,
        page: 1,
      });
      setPendingSubRequests(result.total);
    } catch {
      setPendingSubRequests(0);
    }
  }, [token]);

  useEffect(() => {
    if (!authReady) return;
    void loadPendingUsers();
    void loadNewDemoRequests();
    void loadPendingSubRequests();
  }, [authReady, loadPendingUsers, loadNewDemoRequests, loadPendingSubRequests, pathname, statusFilter]);

  useEffect(() => {
    const onFocus = () => {
      void loadPendingUsers();
      void loadNewDemoRequests();
      void loadPendingSubRequests();
    };
    const onUsersChanged = () => void loadPendingUsers();
    const onDemoChanged = () => void loadNewDemoRequests();
    const onSubChanged = () => void loadPendingSubRequests();
    window.addEventListener("focus", onFocus);
    window.addEventListener("platform-users-changed", onUsersChanged);
    window.addEventListener("platform-demo-requests-changed", onDemoChanged);
    window.addEventListener("platform-subscription-requests-changed", onSubChanged);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("platform-users-changed", onUsersChanged);
      window.removeEventListener("platform-demo-requests-changed", onDemoChanged);
      window.removeEventListener("platform-subscription-requests-changed", onSubChanged);
    };
  }, [loadPendingUsers, loadNewDemoRequests, loadPendingSubRequests]);

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <BrandHeader role={admin?.role} />
        </SidebarHeader>

        <SidebarContent>
          {NAV_GROUPS.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map(
                    ({
                      href,
                      label,
                      icon: Icon,
                      pendingFilter,
                      demoRequestsBadge,
                      subscriptionRequestsBadge,
                    }) => {
                    const active = isActive(pathname, href, statusFilter, pendingFilter);
                    const badgeCount = pendingFilter
                      ? pendingUsers
                      : demoRequestsBadge
                        ? newDemoRequests
                        : subscriptionRequestsBadge
                          ? pendingSubRequests
                          : 0;
                    const showBadge = Boolean(
                      pendingFilter || demoRequestsBadge || subscriptionRequestsBadge,
                    );
                    const tooltip =
                      pendingFilter && pendingUsers > 0
                        ? `${label} (${pendingUsers} awaiting approval)`
                        : demoRequestsBadge && newDemoRequests > 0
                          ? `${label} (${newDemoRequests} new)`
                          : subscriptionRequestsBadge && pendingSubRequests > 0
                            ? `${label} (${pendingSubRequests} pending)`
                            : label;

                    return (
                      <SidebarMenuItem key={href} className="relative">
                        <SidebarMenuButton asChild isActive={active} tooltip={tooltip}>
                          <Link href={href}>
                            <Icon />
                            <span>{label}</span>
                          </Link>
                        </SidebarMenuButton>
                        {showBadge ? (
                          <span
                            className={cn(
                              "pointer-events-none absolute top-1/2 right-2 flex h-4 min-w-4 -translate-y-1/2 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums leading-none",
                              badgeCount > 0
                                ? "bg-sky-500 text-white"
                                : "border border-border bg-muted text-muted-foreground",
                              "group-data-[collapsible=icon]/sidebar-wrapper:right-0.5 group-data-[collapsible=icon]/sidebar-wrapper:h-4 group-data-[collapsible=icon]/sidebar-wrapper:w-4 group-data-[collapsible=icon]/sidebar-wrapper:min-w-0 group-data-[collapsible=icon]/sidebar-wrapper:px-0",
                            )}
                          >
                            {badgeCount > 99 ? "99+" : badgeCount}
                          </span>
                        ) : null}
                      </SidebarMenuItem>
                    );
                  },
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
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
                    <Link href="/">Dashboard</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                {pathname !== "/" ? (
                  <>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage>{breadcrumbLabel(pathname)}</BreadcrumbPage>
                    </BreadcrumbItem>
                  </>
                ) : null}
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <div className="flex shrink-0 items-center gap-2.5 px-4">
            <div className="hidden items-center gap-1.5 rounded-full border border-green-100 bg-green-50/80 px-3 py-1.5 text-xs font-medium text-green-600 sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
              Platform
            </div>
            {admin ? (
              <UserMenu
                user={{ name: admin.name, email: admin.email }}
                onLogout={logout}
              />
            ) : null}
          </div>
        </header>

        <div className="@container/main flex flex-1 flex-col gap-2">
          <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
            <div className="flex flex-col gap-4 px-4 md:gap-6 lg:px-6">{children}</div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
