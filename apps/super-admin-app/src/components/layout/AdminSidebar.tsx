"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, type ComponentType } from "react";
import {
  BuildingOffice2Icon,
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
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@voicetalk/ui";
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

export function AdminSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const statusFilter = searchParams.get("status");
  const { admin, token, authReady } = useAuth();
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
  );
}
