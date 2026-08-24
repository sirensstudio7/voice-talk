"use client";

import {
  CheckCircleIcon,
  ClockIcon,
  DocumentTextIcon,
  MicrophoneIcon,
  PresentationChartBarIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { adminPath } from "@/lib/admin-path";
import { useAddonStatus } from "@/lib/use-addon-status";

const FEATURES = [
  {
    icon: DocumentTextIcon,
    title: "Upload decks",
    body: "Import PPTX or PDF, auto-extract slides, and prepare narration for each one.",
  },
  {
    icon: MicrophoneIcon,
    title: "AI narration",
    body: "Generate greeting, slide scripts, and closing lines in your workspace language.",
  },
  {
    icon: SparklesIcon,
    title: "Live sessions",
    body: "Run presentations with a live AI voice host that can answer audience questions.",
  },
] as const;

const SCREENSHOTS = [
  {
    id: "s1",
    src: "https://images.unsplash.com/photo-1557804506-669a67965ba0?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "s2",
    src: "https://images.unsplash.com/photo-1542744173-8e7e53415bb0?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "s3",
    src: "https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "s4",
    src: "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "s5",
    src: "https://images.unsplash.com/photo-1556761175-5973dc0f32e7?auto=format&fit=crop&w=800&q=80",
  },
] as const;

export function AiPresenterPageClient() {
  const { business, status, loading, error, isActive, isPending } =
    useAddonStatus("ai_presenter");
  const { state: sidebarState, isMobile } = useSidebar();
  const slug = business?.slug ?? "";

  const priceLabel = (status?.addon.price_display ?? "Rp199.000/month").replace(
    /\/\s*month/i,
    "",
  );
  const productName = status?.addon.name ?? "AI Presenter";
  const productDescription =
    status?.addon.description ??
    "Upload decks, generate slide narration, and run live AI presentation sessions.";

  const footerStyle = {
    left: isMobile
      ? "0px"
      : sidebarState === "collapsed"
        ? "var(--sidebar-width-icon)"
        : "var(--sidebar-width)",
  } as const;

  return (
    <>
      <div className="mx-auto w-full max-w-3xl space-y-10 pb-24">
        {error ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {loading ? (
          <div className="flex gap-4">
            <div className="size-[88px] shrink-0 animate-pulse rounded-[22px] bg-slate-100" />
            <div className="flex-1 space-y-3 py-1">
              <div className="h-7 w-48 animate-pulse rounded bg-slate-100" />
              <div className="h-4 w-64 animate-pulse rounded bg-slate-100" />
              <div className="h-4 w-24 animate-pulse rounded bg-slate-100" />
            </div>
          </div>
        ) : (
          <header className="flex items-start gap-4 sm:gap-5">
            <div className="flex size-[88px] shrink-0 items-center justify-center rounded-[22px] bg-gradient-to-br from-violet-500 to-indigo-600 shadow-sm sm:size-[104px] sm:rounded-[26px]">
              <PresentationChartBarIcon className="size-10 text-white sm:size-12" aria-hidden />
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <h1 className="text-[22px] font-semibold tracking-tight text-slate-900 sm:text-[28px]">
                {productName}
              </h1>
              <p className="mt-0.5 text-sm text-orange-600 sm:text-[15px]">LORESCALE Add-on</p>
              <p className="mt-2 text-sm text-slate-500">
                {isActive ? (
                  <span className="inline-flex items-center gap-1 font-medium text-emerald-600">
                    <CheckCircleIcon className="size-4" aria-hidden />
                    Installed
                  </span>
                ) : isPending ? (
                  <span className="inline-flex items-center gap-1 font-medium text-amber-600">
                    <ClockIcon className="size-4" aria-hidden />
                    Pending approval
                  </span>
                ) : (
                  <>
                    <span className="font-semibold text-slate-900">{priceLabel}</span>
                    <span className="text-slate-400"> / month · per workspace</span>
                  </>
                )}
              </p>
            </div>
          </header>
        )}

        {!loading && isActive ? (
          <section className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-6">
            <h2 className="text-xl font-semibold tracking-tight text-slate-900">Ready to present</h2>
            <p className="text-sm leading-relaxed text-slate-600">
              Your workspace has AI Presenter. Open the presentations library to upload decks,
              generate narration, and start live sessions.
            </p>
            <Button asChild>
              <Link href={adminPath(slug, "/presentations")}>Open AI Presenter</Link>
            </Button>
          </section>
        ) : !loading ? (
          <>
            <section className="-mx-4 sm:mx-0">
              <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [-ms-overflow-style:none] sm:px-0 [&::-webkit-scrollbar]:hidden">
                {SCREENSHOTS.map((shot) => (
                  <div
                    key={shot.id}
                    className="w-[72%] shrink-0 snap-center overflow-hidden rounded-[20px] bg-slate-100 sm:w-[240px]"
                  >
                    <div className="aspect-[9/16]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={shot.src}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight text-slate-900">About</h2>
              <p className="text-[15px] leading-relaxed text-slate-600">{productDescription}</p>
              <p className="text-[15px] leading-relaxed text-slate-600">
                Ideal for product demos, training, and guest-facing walkthroughs where a live AI host
                keeps the room engaged.
              </p>
            </section>

            <section>
              <h2 className="mb-1 text-xl font-semibold tracking-tight text-slate-900">Features</h2>
              <ul className="divide-y divide-slate-100">
                {FEATURES.map(({ icon: Icon, title, body }) => (
                  <li key={title} className="flex gap-4 py-4">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-50 text-slate-700">
                      <Icon className="size-5" aria-hidden />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-[15px] font-semibold text-slate-900">{title}</h3>
                      <p className="mt-0.5 text-sm leading-relaxed text-slate-500">{body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold tracking-tight text-slate-900">
                Information
              </h2>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between gap-4 border-b border-slate-100 pb-3">
                  <dt className="text-slate-400">Provider</dt>
                  <dd className="font-medium text-slate-900">LORESCALE</dd>
                </div>
                <div className="flex justify-between gap-4 border-b border-slate-100 pb-3">
                  <dt className="text-slate-400">Category</dt>
                  <dd className="font-medium text-slate-900">AI Assistant</dd>
                </div>
                <div className="flex justify-between gap-4 border-b border-slate-100 pb-3">
                  <dt className="text-slate-400">Billing</dt>
                  <dd className="font-medium text-slate-900">Monthly · per workspace</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-400">Price</dt>
                  <dd className="font-medium text-slate-900">{priceLabel}/mo</dd>
                </div>
              </dl>
            </section>
          </>
        ) : null}
      </div>

      <footer
        style={footerStyle}
        className="fixed bottom-0 right-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/80"
      >
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{productName}</p>
            <p className="truncate text-xs text-slate-500">
              {isActive
                ? "Installed on this workspace"
                : isPending
                  ? "Waiting for payment approval"
                  : `${priceLabel}/mo · per workspace`}
            </p>
          </div>
          {isActive || isPending ? (
            <Button variant="outline" disabled>
              {isActive ? "Active" : "Requested"}
            </Button>
          ) : loading ? (
            <Button variant="outline" disabled>
              Subscribe
            </Button>
          ) : (
            <Button asChild>
              <Link href={adminPath(slug, "/add-ons/ai-presenter/payment")}>Subscribe</Link>
            </Button>
          )}
        </div>
      </footer>
    </>
  );
}
