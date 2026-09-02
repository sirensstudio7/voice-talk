"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { SignInPage, type Testimonial } from "@/components/sign-in-page";
import { ApiRequestError } from "@/lib/api";
import { adminPath } from "@/lib/admin-path";
import { useAuth } from "@/lib/auth";
import { getOnboardingRedirectPath } from "@/lib/onboarding";

const LOGIN_HERO_IMAGE =
  "https://images.unsplash.com/photo-1529688124-e6c364d3285c?auto=format&fit=crop&w=1600&q=80";

const LOGIN_TESTIMONIALS: Testimonial[] = [
  {
    avatarSrc: "https://randomuser.me/api/portraits/women/57.jpg",
    name: "Sarah Chen",
    handle: "@sarahdigital",
    text: "Our voice kiosk handles rush hour orders without missing a beat. Setup took minutes.",
  },
  {
    avatarSrc: "https://randomuser.me/api/portraits/men/64.jpg",
    name: "Marcus Johnson",
    handle: "@marcustech",
    text: "Lorescale turned our front counter into a 24/7 team member. Clean dashboard, powerful tools.",
  },
  {
    avatarSrc: "https://randomuser.me/api/portraits/men/32.jpg",
    name: "David Martinez",
    handle: "@davidcreates",
    text: "Guests love talking to our AI host. We love managing everything from one admin panel.",
  },
];

export function LoginPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const freshLogin = searchParams.get("fresh") === "1";
  const { login, logout, user, token, businesses, business, authReady, businessesLoading, businessesError, refreshBusinesses } =
    useAuth();
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
    if (businessesError) return;
    if (token && businesses.length > 0) {
      const onboarding = getOnboardingRedirectPath(businesses, business);
      const slug = business?.slug ?? businesses[0]?.slug;
      router.replace(onboarding ?? (slug ? adminPath(slug, "/") : "/workspaces"));
    }
  }, [authReady, freshLogin, token, businesses, business, businessesError, router]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    try {
      const list = await login(email, password);
      const onboarding = getOnboardingRedirectPath(list, list[0] ?? null);
      const slug = list[0]?.slug;
      router.push(onboarding ?? (slug ? adminPath(slug, "/") : "/workspaces"));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-200 border-t-orange-500" />
      </div>
    );
  }

  if (token && businesses.length > 0) {
    return null;
  }

  if (token && businessesError && businesses.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-[440px] rounded-2xl border border-border bg-card p-6 text-center">
          <h1 className="text-xl font-bold text-foreground">Could not load your workspace</h1>
          <p className="mt-2 text-sm text-muted-foreground">{businessesError}</p>
          <button
            type="button"
            onClick={() => {
              void refreshBusinesses();
            }}
            className="mt-6 w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (token && businesses.length === 0 && !businessesLoading && !businessesError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-[440px] rounded-2xl border border-border bg-card p-6 text-center">
          <h1 className="text-xl font-bold text-foreground">You&apos;re already signed in</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Signed in as <span className="font-medium text-foreground">{user?.email}</span>. Continue
            workspace setup, or sign out to use a different account (e.g. the demo admin).
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <Link
              href="/onboarding/workspace"
              className="rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
            >
              Continue workspace setup
            </Link>
            <button
              type="button"
              onClick={() => {
                logout();
                router.refresh();
              }}
              className="rounded-xl border border-border px-4 py-3 text-sm font-medium text-muted-foreground transition hover:bg-secondary"
            >
              Sign out and use another account
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <SignInPage
      title={
        <>
          Welcome back to{" "}
          <span className="font-light tracking-tighter text-foreground">Lorescale</span>
        </>
      }
      description="Sign in to manage your businesses and voice team."
      heroImageSrc={LOGIN_HERO_IMAGE}
      testimonials={LOGIN_TESTIMONIALS}
      error={error}
      loading={loading}
      googleSignInDisabled
      onSignIn={handleSubmit}
      onCreateAccount={() => router.push("/signup")}
    />
  );
}
