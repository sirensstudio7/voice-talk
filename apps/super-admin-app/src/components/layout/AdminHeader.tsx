"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRightOnRectangleIcon } from "@heroicons/react/24/outline";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Separator,
  SidebarTrigger,
} from "@voicetalk/ui";
import { useAuth } from "@/lib/auth";

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
          <div className="flex size-7 items-center justify-center rounded-full bg-orange-100 text-xs font-semibold text-orange-700">
            {userInitials(user)}
          </div>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{user.name}</p>
            <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-red-600 focus:bg-red-50 focus:text-red-600"
          onSelect={() => {
            onLogout();
            router.push("/login");
          }}
        >
          <ArrowRightOnRectangleIcon className="size-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AdminHeader() {
  const pathname = usePathname();
  const { admin, logout } = useAuth();

  return (
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
        {admin ? <UserMenu user={{ name: admin.name, email: admin.email }} onLogout={logout} /> : null}
      </div>
    </header>
  );
}
