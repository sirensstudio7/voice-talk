"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline";

import { api, ApiRequestError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const HERO_IMAGE =
  "https://images.unsplash.com/photo-1529688124-e6c364d3285c?auto=format&fit=crop&w=1600&q=80";

const TESTIMONIALS = [
  {
    avatarSrc: "https://randomuser.me/api/portraits/women/57.jpg",
    name: "Sarah Chen",
    handle: "@ops",
    text: "Platform tools let us suspend abuse and help customers in seconds.",
  },
  {
    avatarSrc: "https://randomuser.me/api/portraits/men/64.jpg",
    name: "Marcus Johnson",
    handle: "@support",
    text: "One place for users, workspaces, and billing status. Clean and fast.",
  },
];

function GlassInputWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-foreground/5 backdrop-blur-sm transition-colors focus-within:border-violet-400/70 focus-within:bg-violet-500/10">
      {children}
    </div>
  );
}

function TestimonialCard({
  testimonial,
  delay,
}: {
  testimonial: (typeof TESTIMONIALS)[number];
  delay: string;
}) {
  return (
    <div
      className={`animate-testimonial ${delay} flex w-64 items-start gap-3 rounded-3xl border border-white/10 bg-card/40 p-5 backdrop-blur-xl`}
    >
      <img src={testimonial.avatarSrc} className="h-10 w-10 rounded-2xl object-cover" alt="" />
      <div className="text-sm leading-snug text-white">
        <p className="font-medium">{testimonial.name}</p>
        <p className="text-white/70">{testimonial.handle}</p>
        <p className="mt-1 text-white/80">{testimonial.text}</p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const { token, authReady, setSession } = useAuth();
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (authReady && token) router.replace("/");
  }, [authReady, token, router]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    try {
      const result = await api.login(email, password);
      setSession(result.access_token, result.admin);
      router.replace("/");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Invalid email or password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="font-geist flex h-[100dvh] w-[100dvw] flex-col md:flex-row">
      <section className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="flex flex-col gap-6">
            <h1 className="animate-element animate-delay-100 text-4xl font-semibold leading-tight md:text-5xl">
              <span className="font-light tracking-tighter text-foreground">Welcome back to </span>
              <span className="font-semibold text-primary">Lorescale</span>
            </h1>
            <p className="animate-element animate-delay-200 text-muted-foreground">
              Staff access for platform operations and customer support.
            </p>

            <form className="space-y-5" onSubmit={onSubmit}>
              <div className="animate-element animate-delay-300">
                <label className="text-sm font-medium text-muted-foreground">Email Address</label>
                <GlassInputWrapper>
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    placeholder="Enter your email address"
                    className="w-full rounded-2xl border-0 bg-transparent p-4 text-sm shadow-none focus:outline-none focus:ring-0"
                  />
                </GlassInputWrapper>
              </div>

              <div className="animate-element animate-delay-400">
                <label className="text-sm font-medium text-muted-foreground">Password</label>
                <GlassInputWrapper>
                  <div className="relative">
                    <input
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      required
                      placeholder="Enter your password"
                      className="w-full rounded-2xl border-0 bg-transparent p-4 pr-12 text-sm shadow-none focus:outline-none focus:ring-0"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-3 flex items-center"
                    >
                      {showPassword ? (
                        <EyeSlashIcon className="h-5 w-5 text-muted-foreground hover:text-foreground" />
                      ) : (
                        <EyeIcon className="h-5 w-5 text-muted-foreground hover:text-foreground" />
                      )}
                    </button>
                  </div>
                </GlassInputWrapper>
              </div>

              {error ? (
                <div className="animate-element animate-delay-550 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={loading}
                className="animate-element animate-delay-600 w-full rounded-2xl bg-primary py-4 font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Signing in…" : "Sign In"}
              </button>
            </form>
          </div>
        </div>
      </section>

      <section className="relative hidden flex-1 p-4 md:block">
        <div
          className="animate-slide-right animate-delay-300 absolute inset-4 rounded-3xl bg-cover bg-center"
          style={{ backgroundImage: `url(${HERO_IMAGE})` }}
        />
        <div className="absolute bottom-8 left-1/2 flex w-full -translate-x-1/2 justify-center gap-4 px-8">
          <TestimonialCard testimonial={TESTIMONIALS[0]} delay="animate-delay-1000" />
          <div className="hidden xl:flex">
            <TestimonialCard testimonial={TESTIMONIALS[1]} delay="animate-delay-1200" />
          </div>
        </div>
      </section>
    </div>
  );
}
