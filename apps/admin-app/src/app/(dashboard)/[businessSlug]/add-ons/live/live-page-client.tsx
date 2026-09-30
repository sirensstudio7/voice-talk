"use client";

import {
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  ClockIcon,
  PlusIcon,
  ShoppingBagIcon,
  SparklesIcon,
  VideoCameraIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { adminPath } from "@/lib/admin-path";
import { api, type LiveSession } from "@/lib/api";
import { useAddonStatus } from "@/lib/use-addon-status";

const FEATURES = [
  {
    icon: SparklesIcon,
    title: "AI host in the chat",
    body: "Viewers ask about price or stock. The host answers from your LIVE products and talking points.",
  },
  {
    icon: ChatBubbleLeftRightIcon,
    title: "Control Room + public watch",
    body: "Start a room, share the watch link, and talk with shoppers in real time.",
  },
  {
    icon: ShoppingBagIcon,
    title: "Dedicated LIVE catalog",
    body: "Upload show-only items like apparel or makeup. Shoppers tap Buy Now and pay with your Payment QR.",
  },
] as const;

const SCREENSHOTS = [
  {
    id: "s1",
    src: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "s2",
    src: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "s3",
    src: "https://images.unsplash.com/photo-1556741533-6e6a62bd8b49?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "s4",
    src: "https://images.unsplash.com/photo-1556740749-887f6717d7e4?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "s5",
    src: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=800&q=80",
  },
] as const;

function statusLabel(status: string) {
  if (status === "live") return "On air";
  if (status === "ended") return "Ended";
  return "Draft";
}

export function LivePageClient() {
  const router = useRouter();
  const { token, business, status, loading, error, isActive, isPending } = useAddonStatus("live");
  const { state: sidebarState, isMobile } = useSidebar();
  const slug = business?.slug ?? "";

  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const priceLabel = (status?.addon.price_display ?? "Rp199.000/month").replace(
    /\/\s*month/i,
    "",
  );
  const productName = status?.addon.name ?? "LORESCALE LIVE";
  const productDescription =
    status?.addon.description ??
    "Go live with an AI host, chat, and a dedicated product catalog for the show.";

  useEffect(() => {
    if (!token || !business?.id || !isActive) return;
    let cancelled = false;
    void (async () => {
      setSessionsLoading(true);
      try {
        const live = await api.listLiveSessions(token, business.id);
        if (cancelled) return;
        setSessions(live.items);
      } catch (err) {
        if (!cancelled) {
          setFormError(err instanceof Error ? err.message : "Failed to load LIVE rooms");
        }
      } finally {
        if (!cancelled) setSessionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, business?.id, isActive]);

  const footerStyle = {
    left: isMobile
      ? "0px"
      : sidebarState === "collapsed"
        ? "var(--sidebar-width-icon)"
        : "var(--sidebar-width)",
  } as const;

  async function createSession() {
    if (!token || !business?.id || !title.trim()) return;
    setCreating(true);
    setFormError(null);
    try {
      const created = await api.createLiveSession(token, business.id, {
        title: title.trim(),
      });
      router.push(adminPath(slug, `/add-ons/live/${created.id}`));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create LIVE");
    } finally {
      setCreating(false);
    }
  }

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
            <div className="flex size-[88px] shrink-0 items-center justify-center rounded-[22px] bg-gradient-to-br from-red-500 to-rose-600 shadow-sm sm:size-[104px] sm:rounded-[26px]">
              <VideoCameraIcon className="size-10 text-white sm:size-12" aria-hidden />
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
          <section className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-slate-900">Control Center</h2>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">
                Create a room, add dedicated LIVE products, then go live. Shoppers watch at your
                public LIVE link — this is separate from the kiosk menu and voice session.
              </p>
            </div>

            {formError ? (
              <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {formError}
              </p>
            ) : null}

            <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="text-sm font-semibold text-slate-900">New LIVE</h3>
              <label className="block text-sm">
                <span className="text-slate-500">Title</span>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Friday flash sale"
                />
              </label>
              <p className="text-sm text-slate-500">
                After you create the room, add dedicated products in Control Room — not from Menu.
              </p>
              <Button
                type="button"
                disabled={creating || !title.trim()}
                onClick={() => void createSession()}
              >
                <PlusIcon className="size-4" aria-hidden />
                {creating ? "Creating…" : "Create room"}
              </Button>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-900">Rooms</h3>
              {sessionsLoading ? (
                <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
              ) : sessions.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                  No LIVE rooms yet. Create one above.
                </p>
              ) : (
                <ul className="space-y-2">
                  {sessions.map((session) => (
                    <li key={session.id}>
                      <Link
                        href={adminPath(slug, `/add-ons/live/${session.id}`)}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 transition hover:border-slate-300"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {session.title}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {session.products.length} products · {session.viewer_count} watching
                          </p>
                        </div>
                        <span
                          className={
                            session.status === "live"
                              ? "rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-600"
                              : session.status === "ended"
                                ? "rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500"
                                : "rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700"
                          }
                        >
                          {statusLabel(session.status)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
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
                LIVE is its own room. The kiosk voice assistant stays 1:1 and is not used here.
              </p>
            </section>

            <section>
              <h2 className="mb-1 text-xl font-semibold tracking-tight text-slate-900">Features</h2>
              <ul className="divide-y divide-slate-100">
                {FEATURES.map(({ icon: Icon, title: featureTitle, body }) => (
                  <li key={featureTitle} className="flex gap-4 py-4">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-50 text-slate-700">
                      <Icon className="size-5" aria-hidden />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-[15px] font-semibold text-slate-900">{featureTitle}</h3>
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
                  <dd className="font-medium text-slate-900">LIVE shopping</dd>
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

      {!isActive ? (
        <footer
          style={footerStyle}
          className="fixed bottom-0 right-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/80"
        >
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{productName}</p>
              <p className="truncate text-xs text-slate-500">
                {isPending
                  ? "Waiting for payment approval"
                  : `${priceLabel}/mo · per workspace`}
              </p>
            </div>
            {isPending ? (
              <Button variant="outline" disabled>
                Requested
              </Button>
            ) : loading ? (
              <Button variant="outline" disabled>
                Subscribe
              </Button>
            ) : (
              <Button asChild>
                <Link href={adminPath(slug, "/add-ons/live/payment")}>Subscribe</Link>
              </Button>
            )}
          </div>
        </footer>
      ) : null}
    </>
  );
}
