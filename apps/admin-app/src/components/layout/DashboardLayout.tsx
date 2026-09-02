"use client";

import { usePathname } from "next/navigation";
import { SidebarProvider, SidebarInset } from "@voicetalk/ui";
import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";
import { stripBusinessSlug } from "@/lib/admin-path";
import { useAuth } from "@/lib/auth";

function isFullscreenRoute(pathname: string, businessSlug?: string | null) {
  const path = stripBusinessSlug(pathname, businessSlug);
  return (
    /^\/presentations\/[^/]+\/preview$/.test(path) ||
    /^\/presentations\/[^/]+\/focus$/.test(path) ||
    /^\/sessions\/[^/]+\/live$/.test(path)
  );
}

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { business } = useAuth();
  const slug = business?.slug ?? "";
  
  const fullscreen = isFullscreenRoute(pathname, slug || null);

  if (fullscreen) {
    return <div className="min-h-svh bg-background text-foreground">{children}</div>;
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <AppHeader />
        <div className="@container/main flex flex-1 flex-col gap-2">
          <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
            <div className="flex flex-col gap-4 px-4 lg:px-6 md:gap-6">{children}</div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
