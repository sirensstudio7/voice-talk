"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/lib/auth";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { token, businesses, businessesLoading, businessesError, authReady, refreshBusinesses } =
    useAuth();

  useEffect(() => {
    if (!authReady) return;
    if (!token) {
      router.replace("/login");
      return;
    }
  }, [authReady, token, router]);

  if (!authReady || !token || businessesLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-200 border-t-orange-500" />
      </div>
    );
  }

  if (businessesError && businesses.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center">
          <p className="text-sm font-medium text-slate-900">Could not load your workspace</p>
          <p className="mt-2 text-sm text-slate-500">{businessesError}</p>
          <p className="mt-2 text-xs text-slate-400">
            The API health check must show a working database connection. If requests time out, check{" "}
            <span className="font-mono">DATABASE_URL</span> in <span className="font-mono">.env</span>{" "}
            and run <span className="font-mono">npm run api:ensure</span> from the project root.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={() => {
                void refreshBusinesses();
              }}
              className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => router.replace("/login?fresh=1")}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Sign in again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (businesses.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center">
          <p className="text-sm font-medium text-slate-900">No workspace found</p>
          <p className="mt-2 text-sm text-slate-500">
            Create a business to continue, or sign in again if this persists.
          </p>
        </div>
      </div>
    );
  }

  return <DashboardLayout>{children}</DashboardLayout>;
}
