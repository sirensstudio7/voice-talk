"use client";

import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  EnvelopeIcon,
  LockClosedIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";

import { ApiRequestError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { getOnboardingRedirectPath } from "@/lib/onboarding";
import { marketingLandingUrl } from "@/lib/site-links";

const LOGIN_BRAND_IMAGE =
  "https://images.unsplash.com/photo-1529688124-e6c364d3285c?auto=format&fit=crop&w=1600&q=80";

export function LoginPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const freshLogin = searchParams.get("fresh") === "1";
  const { login, logout, user, token, businesses, business, authReady } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const clearedStaleSession = useRef(false);

  useEffect(() => {
    if (!authReady || !freshLogin || clearedStaleSession.current) return;
    clearedStaleSession.current = true;
    if (token) {
      logout();
    }
  }, [authReady, freshLogin, token, logout]);

  useEffect(() => {
    if (!authReady || freshLogin) return;
    if (token && businesses.length > 0) {
      router.replace(getOnboardingRedirectPath(businesses, business) ?? "/");
    }
  }, [authReady, freshLogin, token, businesses, business, router]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const list = await login(email, password);
      router.push(getOnboardingRedirectPath(list, list[0] ?? null) ?? "/");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Invalid email or password.");
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
            Signed in as <span className="font-medium text-slate-700">{user?.email}</span>. Continue
            workspace setup, or sign out to use a different account (e.g. the demo admin).
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
              Sign out and use another account
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      {/* Brand panel */}
      <div className="relative hidden w-1/2 overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12">
        <Image
          src={LOGIN_BRAND_IMAGE}
          alt="Sunflower flowers across green hills under white clouds"
          fill
          priority
          className="object-cover"
          sizes="50vw"
        />
        <div className="pointer-events-none absolute inset-0 bg-slate-900/55" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-900/80 via-slate-900/20 to-slate-900/40" />

        <div className="relative z-10">
          <a
            href={marketingLandingUrl}
            className="inline-flex items-center gap-3 rounded-xl transition hover:opacity-90"
            aria-label="Back to Lorescale landing page"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500 shadow-lg shadow-orange-500/25">
              <SparklesIcon className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-semibold tracking-tight text-white">Lorescale Admin</span>
          </a>
        </div>

        <div className="relative z-10">
          <h2 className="text-4xl font-bold leading-tight tracking-tight text-white xl:text-5xl">
            Your voice team,
            <br />
            <span className="text-orange-400">fully managed.</span>
          </h2>
          <p className="mt-4 max-w-sm text-base leading-relaxed text-white">
            Run your business conversations, team, and settings from one simple dashboard.
          </p>
        </div>

        <p className="relative z-10 text-sm text-slate-300">Powered by VoiceTalk</p>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center bg-slate-50 px-6 py-12">
        <div className="w-full max-w-[400px]">
          {/* Mobile brand */}
          <a
            href={marketingLandingUrl}
            className="mb-10 inline-flex w-full items-center justify-center gap-3 rounded-xl transition hover:opacity-80 lg:hidden"
            aria-label="Back to Lorescale landing page"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500 shadow-md shadow-orange-500/20">
              <SparklesIcon className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-semibold tracking-tight text-slate-900">Lorescale Admin</span>
          </a>

          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Welcome back</h1>
            <p className="mt-2 text-sm text-slate-500">Sign in to manage your businesses and voice team.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
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
                  placeholder="admin@sunrise.coffee"
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
                  autoComplete="current-password"
                  required
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-orange-400 focus:ring-2 focus:ring-orange-500/20"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
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
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Signing in…
                </span>
              ) : (
                "Sign in"
              )}
            </button>
          </form>

          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
            <p className="font-medium text-slate-600">Demo admin account</p>
            <p className="mt-1">
              Email: <span className="font-mono text-slate-700">admin@sunrise.coffee</span>
            </p>
            <p>
              Password: <span className="font-mono text-slate-700">admin123</span>
            </p>
          </div>

          <p className="mt-5 text-center text-sm text-slate-500">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="font-medium text-orange-600 hover:text-orange-700">
              Create account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
