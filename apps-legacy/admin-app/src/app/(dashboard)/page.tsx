"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/lib/auth";
import { adminPath } from "@/lib/admin-path";

/** Bare `/` → `/{businessSlug}` overview. */
export default function DashboardRootRedirect() {
  const router = useRouter();
  const { business, businesses, authReady } = useAuth();

  useEffect(() => {
    if (!authReady) return;
    const slug = business?.slug ?? businesses[0]?.slug;
    if (slug) router.replace(adminPath(slug, "/"));
    else router.replace("/workspaces");
  }, [authReady, business, businesses, router]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-200 border-t-orange-500" />
    </div>
  );
}
