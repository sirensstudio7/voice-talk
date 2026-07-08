"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  EnvelopeIcon,
  LockClosedIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";

import { ApiRequestError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { getOnboardingRedirectPath } from "@/lib/onboarding";

export function SignupPageClient() {
  const router = useRouter();
  const { signup, logout, user, token, businesses, business, authReady } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authReady) return;
    if (token && businesses.length > 0) {
      router.replace(getOnboardingRedirectPath(businesses, business) ?? "/");
    }
  }, [authReady, token, businesses, business, router]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await signup(email, password);
      router.push("/onboarding/workspace");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Sign up failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-200 border-t-orange-500" />
      </div>
    );
  }

  if (token && businesses.length > 0) {
    return null;
  }

  if (token && businesses.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
        <div className="w-full max-w-[440px] rounded-2xl border border-slate-200/80 bg-white p-6 text-center shadow-sm">
          <h1 className="text-xl font-bold text-slate-900">You&apos;re already signed in</h1>
          <p className="mt-2 text-sm text-slate-500">
            Signed in as <span className="font-medium text-slate-700">{user?.email}</span>. Finish
            setting up your workspace, or sign out to create a different account.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <Link
              href="/onboarding/workspace"
              className="rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-orange-500/20 transition hover:bg-orange-600"
            >
              Continue workspace setup
            </Link>
            <button
              type="button"
              onClick={() => {
                logout();
                router.refresh();
              }}
              className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Sign out and create new account
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
      <div className="w-full max-w-[440px]">
        <div className="mb-8 flex items-center justify-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500 shadow-md shadow-orange-500/20">
            <SparklesIcon className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-semibold tracking-tight text-slate-900">Lorescale Admin</span>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Welcome to Lorescale</h1>
            <p className="mt-2 text-sm text-slate-500">Create AI Employees for your business.</p>
          </div>

          <button
            type="button"
            disabled
            className="mb-5 flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-400"
          >
            Continue with Google
            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] uppercase tracking-wide">
              Soon
            </span>
          </button>

          <div className="mb-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">or</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-700">
                Email
              </label>
              <div className="relative">
                <EnvelopeIcon className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-orange-400 focus:ring-2 focus:ring-orange-500/20"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-700">
                Password
              </label>
              <div className="relative">
                <LockClosedIcon className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-orange-400 focus:ring-2 focus:ring-orange-500/20"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              <p className="mt-1.5 text-xs text-slate-400">Minimum 8 characters</p>
            </div>

            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-orange-500/20 transition hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Creating account…" : "Create Account"}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-slate-500">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-orange-600 hover:text-orange-700">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
