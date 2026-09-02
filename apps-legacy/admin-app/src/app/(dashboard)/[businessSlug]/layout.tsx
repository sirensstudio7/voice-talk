"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

import { useAuth } from "@/lib/auth";
import { isReservedAdminSlug } from "@/lib/admin-path";

export default function BusinessSlugLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ businessSlug: string }>();
  const router = useRouter();
  const { businesses, business, setBusinessId, authReady } = useAuth();
  const slug = typeof params.businessSlug === "string" ? params.businessSlug : "";

  useEffect(() => {
    if (!authReady || !slug || businesses.length === 0) return;

    if (isReservedAdminSlug(slug)) {
      const fallback = business?.slug ?? businesses[0]?.slug;
      if (fallback) router.replace(`/${fallback}`);
      else router.replace("/workspaces");
      return;
    }

    const match = businesses.find((b) => b.slug === slug);
    if (!match) {
      const fallback = business?.slug ?? businesses[0]?.slug;
      if (fallback) router.replace(`/${fallback}`);
      else router.replace("/workspaces");
      return;
    }

    if (business?.id !== match.id) {
      setBusinessId(match.id);
    }
  }, [authReady, slug, businesses, business, setBusinessId, router]);

  if (!authReady || !slug) return null;

  const match = businesses.find((b) => b.slug === slug);
  if (!match) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-200 border-t-orange-500" />
      </div>
    );
  }

  return <>{children}</>;
}
