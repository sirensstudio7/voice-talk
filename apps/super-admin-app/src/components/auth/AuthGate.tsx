"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { token, authReady } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (authReady && !token) {
      router.replace("/login");
    }
  }, [authReady, token, router]);

  if (!authReady || !token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-200 border-t-orange-500" />
      </div>
    );
  }

  return <>{children}</>;
}
