"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useAuth } from "@/lib/auth";
import { adminPath } from "@/lib/admin-path";

/** Redirect flat business routes (/knowledge) to /{slug}/knowledge. */
export function LegacyBusinessRedirect() {
  const router = useRouter();
  const pathname = usePathname();
  const { business, businesses, authReady } = useAuth();

  useEffect(() => {
    if (!authReady) return;
    const slug = business?.slug ?? businesses[0]?.slug;
    if (!slug) {
      router.replace("/workspaces");
      return;
    }
    router.replace(adminPath(slug, pathname || "/"));
  }, [authReady, business, businesses, pathname, router]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-200 border-t-orange-500" />
    </div>
  );
}
