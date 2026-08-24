"use client";

import { PaperAirplaneIcon, SpeakerWaveIcon, XMarkIcon } from "@heroicons/react/24/outline";
import type { AvatarMode } from "@voicetalk/avatar";
import { formatCurrency } from "@voicetalk/shared";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";

import { ExperienceBackground } from "@/components/experience-background";
import { PaymentStep } from "@/components/payment-step";
import { BOTTOM_GRADIENT_HEIGHT_CLASS, buildBottomGradient } from "@/lib/gradient-style";
import { playLivePcm, playLiveWavBase64, speakLiveText, stopLiveSpeech, unlockLiveAudio, livePlaybackRemainingMs } from "@/lib/live-audio";
import {
  buildLiveViewerWsUrl,
  fetchPublicLive,
  persistLiveOrder,
  type LiveMessage,
  type LiveProduct,
  type LiveSession,
} from "@/lib/live-api";
import { fetchMenu, resolveMediaUrl } from "@/lib/menu-api";
import type { OrderState } from "@/types/voice";

const AvatarHero = dynamic(
  () => import("@voicetalk/avatar").then((mod) => ({ default: mod.AvatarHero })),
  { ssr: false, loading: () => null },
);

const NAME_KEY = "lorescale_live_name";
const DETAILS_KEY = "lorescale_live_checkout";

type CheckoutDetails = {
  name: string;
  phone: string;
  address: string;
  notes: string;
};

const emptyDetails: CheckoutDetails = { name: "", phone: "", address: "", notes: "" };

function loadCheckoutDetails(fallbackName: string): CheckoutDetails {
  try {
    const raw = window.localStorage.getItem(DETAILS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CheckoutDetails>;
      return {
        name: String(parsed.name ?? "").trim() || fallbackName,
        phone: String(parsed.phone ?? ""),
        address: String(parsed.address ?? ""),
        notes: String(parsed.notes ?? ""),
      };
    }
  } catch {
    // ignore
  }
  return { ...emptyDetails, name: fallbackName };
}

function detailsReady(details: CheckoutDetails) {
  return (
    details.name.trim().length >= 2 &&
    details.phone.trim().length >= 8 &&
    details.address.trim().length >= 8
  );
}

function messageExtraText(body: string, productName?: string) {
  const text = body.trim();
  if (!productName) return text;
  if (text.toLowerCase() === productName.toLowerCase()) return "";
  const prefixed = new RegExp(`^tell me about\\s+${productName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i");
  if (prefixed.test(text)) return "";
  return text;
}

function ProductChip({
  name,
  onRemove,
}: {
  name: string;
  onRemove?: () => void;
}) {
  return (
    <span className="inline-flex max-w-[11rem] shrink-0 items-center gap-1 rounded-full bg-red-500/20 px-2 py-0.5 text-[11px] font-semibold text-red-100 ring-1 ring-red-400/40">
      <span className="truncate">{name}</span>
      {onRemove ? (
        <button type="button" onClick={onRemove} aria-label={`Remove ${name}`} className="text-red-200 hover:text-white">
          <XMarkIcon className="size-3" />
        </button>
      ) : null}
    </span>
  );
}

const checkoutFieldClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100";

type Incoming =
  | { type: "chat.history"; items: LiveMessage[] }
  | { type: "chat.message"; message: LiveMessage }
  | { type: "viewer.count"; count: number }
  | { type: "session.status"; status: string }
  | { type: "product.show"; product: LiveProduct }
  | { type: "ai.audio"; wav_base64: string; duration_seconds: number }
  | { type: "ai.speak"; text: string };

type AvatarConfig = {
  modelPath: string;
  assistantName: string;
  backgroundUrl: string;
  gradientColor: string;
};

function GuestNameGate({
  assistantName,
  onReady,
}: {
  assistantName: string;
  onReady: (name: string) => void;
}) {
  const [name, setName] = useState("");

  return (
    <form
      className="w-full max-w-sm space-y-4 rounded-3xl bg-white/95 p-6 shadow-2xl ring-1 ring-white/40 backdrop-blur"
      onSubmit={(event) => {
        event.preventDefault();
        const next = name.trim().slice(0, 80) || "Guest";
        window.localStorage.setItem(NAME_KEY, next);
        unlockLiveAudio();
        onReady(next);
      }}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-red-600">LORESCALE LIVE</p>
      <h1 className="text-xl font-semibold text-slate-900">Join {assistantName}</h1>
      <p className="text-sm text-slate-500">Pick a name so the host and AI can talk to you.</p>
      <input
        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Your name"
        autoFocus
        maxLength={80}
      />
      <button
        type="submit"
        className="w-full rounded-xl bg-red-500 py-3 text-sm font-bold text-white hover:bg-red-600"
      >
        Enter LIVE
      </button>
    </form>
  );
}

function CheckoutDetailsForm({
  productName,
  details,
  onChange,
  onContinue,
}: {
  productName: string;
  details: CheckoutDetails;
  onChange: (next: CheckoutDetails) => void;
  onContinue: () => void;
}) {
  const ready = detailsReady(details);
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) onContinue();
      }}
    >
      <p className="text-sm text-slate-500">
        Where should we send <span className="font-medium text-slate-800">{productName}</span>?
      </p>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">Full name</span>
        <input
          className={checkoutFieldClass}
          value={details.name}
          onChange={(event) => onChange({ ...details, name: event.target.value })}
          placeholder="Your name"
          autoComplete="name"
          maxLength={80}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">Phone</span>
        <input
          className={checkoutFieldClass}
          value={details.phone}
          onChange={(event) => onChange({ ...details, phone: event.target.value })}
          placeholder="08…"
          autoComplete="tel"
          inputMode="tel"
          maxLength={50}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">Address</span>
        <textarea
          className={`${checkoutFieldClass} min-h-[4.5rem] resize-none`}
          value={details.address}
          onChange={(event) => onChange({ ...details, address: event.target.value })}
          placeholder="Street, city, postal code"
          autoComplete="street-address"
          maxLength={500}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">
          Note <span className="font-normal text-slate-400">(optional)</span>
        </span>
        <input
          className={checkoutFieldClass}
          value={details.notes}
          onChange={(event) => onChange({ ...details, notes: event.target.value })}
          placeholder="Apartment, landmark, delivery note"
          maxLength={500}
        />
      </label>
      <button
        type="submit"
        disabled={!ready}
        className="w-full rounded-xl bg-red-500 py-3 text-sm font-bold text-white hover:bg-red-600 disabled:bg-slate-300"
      >
        Continue to payment
      </button>
    </form>
  );
}

function LiveStage({
  config,
  isTalking,
  mode,
  mouthOpen,
}: {
  config: AvatarConfig | null;
  isTalking: boolean;
  mode: AvatarMode;
  mouthOpen: number;
}) {
  const name = config?.assistantName || "Assistant";
  const modelPath = config?.modelPath?.trim() || "";
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <ExperienceBackground backgroundUrl={config?.backgroundUrl} />
      <div className="absolute inset-0 bg-slate-950/35" />
      {modelPath ? (
        <AvatarHero
          key={modelPath}
          isTalking={isTalking}
          mode={mode}
          mouthOpen={mouthOpen}
          modelPath={modelPath}
          assistantName={name}
          framing="bust"
          frameClassName="absolute bottom-0 left-1/2 aspect-[2/3] h-[118vh] max-h-none w-auto max-w-[100vw] -translate-x-1/2 overflow-visible bg-transparent lg:left-[36%] lg:h-[128vh]"
          performanceMode="lite"
          pauseWhenHidden
        />
      ) : null}
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 ${BOTTOM_GRADIENT_HEIGHT_CLASS}`}
        style={{ backgroundImage: buildBottomGradient(config?.gradientColor || "#0f172a") }}
      />
    </div>
  );
}

export function LiveWatchClient({ slug, sessionId }: { slug: string; sessionId: string }) {
  const [guestName, setGuestName] = useState<string | null>(null);
  const [session, setSession] = useState<LiveSession | null>(null);
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [chat, setChat] = useState("");
  const [chatProduct, setChatProduct] = useState<LiveProduct | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState<LiveProduct | null>(null);
  const [checkout, setCheckout] = useState<LiveProduct | null>(null);
  const [checkoutStep, setCheckoutStep] = useState<"details" | "pay">("details");
  const [details, setDetails] = useState<CheckoutDetails>(emptyDetails);
  const [paid, setPaid] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [avatar, setAvatar] = useState<AvatarConfig | null>(null);
  const [avatarMode, setAvatarMode] = useState<AvatarMode>("idle");
  const [isTalking, setIsTalking] = useState(false);
  const [mouthOpen, setMouthOpen] = useState(0);
  const [needUnlock, setNeedUnlock] = useState(true);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const talkTimer = useRef<number | null>(null);
  const pendingSpeak = useRef<number | null>(null);
  const lastWavRef = useRef<string | null>(null);
  const latestAiBody = useRef("");

  useEffect(() => {
    const stored = window.localStorage.getItem(NAME_KEY)?.trim();
    if (stored) setGuestName(stored.slice(0, 80));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchMenu(slug)
      .then((data) => {
        if (cancelled) return;
        setAvatar({
          modelPath: data.avatar_model_path || "",
          assistantName: data.assistant_name || "Assistant",
          backgroundUrl: data.background_url || "",
          gradientColor: data.gradient_color || "#0f172a",
        });
      })
      .catch(() => {
        if (!cancelled) {
          setAvatar({
            modelPath: "",
            assistantName: "Assistant",
            backgroundUrl: "",
            gradientColor: "#0f172a",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (!guestName) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchPublicLive(sessionId);
        if (cancelled) return;
        if (data.session.business_slug && data.session.business_slug !== slug) {
          setError("This LIVE belongs to another store.");
          return;
        }
        setSession(data.session);
        setMessages(data.messages);
        const lastAi = [...data.messages].reverse().find((item) => item.role === "ai");
        if (lastAi) latestAiBody.current = lastAi.body;
        setHighlighted(data.session.products[0] ?? null);
        setAvatarMode("greeting");
        window.setTimeout(() => setAvatarMode("idle"), 2800);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "This LIVE is not on air");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [guestName, sessionId, slug]);

  function speakForMs(ms: number) {
    const duration = Math.max(ms, livePlaybackRemainingMs());
    if (talkTimer.current) window.clearTimeout(talkTimer.current);
    setIsTalking(true);
    setAvatarMode("talking");
    talkTimer.current = window.setTimeout(() => {
      setIsTalking(false);
      setAvatarMode("idle");
      setMouthOpen(0);
    }, duration);
  }

  function enableSound() {
    unlockLiveAudio();
    setNeedUnlock(false);
    setAudioBlocked(false);
    const wav = lastWavRef.current;
    if (wav) {
      void (async () => {
        try {
          const played = await playLiveWavBase64(wav);
          speakForMs(Math.round((played || 3) * 1000));
        } catch {
          setAudioBlocked(true);
        }
      })();
    }
  }

  useEffect(() => {
    if (!guestName || !session) return;
    const ws = new WebSocket(buildLiveViewerWsUrl(sessionId, guestName));
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;
    ws.onmessage = (event) => {
      try {
        if (event.data instanceof ArrayBuffer) {
          if (pendingSpeak.current) {
            window.clearTimeout(pendingSpeak.current);
            pendingSpeak.current = null;
          }
          playLivePcm(event.data);
          setNeedUnlock(false);
          setAudioBlocked(false);
          speakForMs(livePlaybackRemainingMs() || 400);
          return;
        }
        const data = JSON.parse(String(event.data)) as Incoming;
        if (data.type === "chat.history") {
          setMessages(data.items);
          const lastAi = [...data.items].reverse().find((item) => item.role === "ai");
          if (lastAi) latestAiBody.current = lastAi.body;
        }
        if (data.type === "chat.message") {
          setMessages((current) =>
            current.some((item) => item.id === data.message.id)
              ? current
              : [...current, data.message],
          );
          if (data.message.role === "ai") {
            latestAiBody.current = data.message.body;
          }
        }
        if (data.type === "ai.audio" && data.wav_base64) {
          lastWavRef.current = data.wav_base64;
          if (pendingSpeak.current) {
            window.clearTimeout(pendingSpeak.current);
            pendingSpeak.current = null;
          }
          stopLiveSpeech();
          void (async () => {
            try {
              const played = await playLiveWavBase64(data.wav_base64);
              setAudioBlocked(false);
              speakForMs(Math.round((played || data.duration_seconds || 3) * 1000));
            } catch {
              setAudioBlocked(true);
              speakForMs(Math.round((data.duration_seconds || 3) * 1000));
            }
          })();
        }
        if (data.type === "ai.speak" && data.text) {
          if (pendingSpeak.current) {
            window.clearTimeout(pendingSpeak.current);
            pendingSpeak.current = null;
          }
          const ms = speakLiveText(data.text);
          if (ms) {
            setAudioBlocked(false);
            speakForMs(ms);
          } else {
            setAudioBlocked(true);
          }
        }
        if (data.type === "viewer.count") {
          setSession((current) => (current ? { ...current, viewer_count: data.count } : current));
        }
        if (data.type === "session.status") {
          setSession((current) => (current ? { ...current, status: data.status } : current));
        }
        if (data.type === "product.show") {
          setHighlighted(data.product);
          setAvatarMode("acknowledge");
          window.setTimeout(() => setAvatarMode((current) => (current === "acknowledge" ? "idle" : current)), 1800);
        }
      } catch {
        // ignore
      }
    };
    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [guestName, sessionId, session?.id]);

  useEffect(() => {
    const unlock = () => {
      unlockLiveAudio();
      setNeedUnlock(false);
    };
    window.addEventListener("pointerdown", unlock);
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  useEffect(() => {
    if (!isTalking) {
      setMouthOpen(0);
      return;
    }
    const id = window.setInterval(() => {
      setMouthOpen(0.18 + Math.random() * 0.62);
    }, 110);
    return () => window.clearInterval(id);
  }, [isTalking]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length]);

  useEffect(() => {
    return () => {
      if (talkTimer.current) window.clearTimeout(talkTimer.current);
      stopLiveSpeech();
    };
  }, []);

  const order: OrderState | null = useMemo(() => {
    if (!checkout) return null;
    return {
      status: "open",
      items: [
        {
          product_id: checkout.product_id || checkout.id,
          name: checkout.name,
          price: checkout.price,
          quantity: 1,
          subtotal: checkout.price,
          image_url: checkout.image_url,
        },
      ],
      total: checkout.price,
    };
  }, [checkout]);

  const latestAi = [...messages].reverse().find((message) => message.role === "ai");
  const chatMessages = messages.filter((message) => message.role !== "ai");
  const assistantName = avatar?.assistantName || "Assistant";

  function sendChatBody(body: string, productId?: string | null) {
    const text = body.trim();
    if (!text || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    unlockLiveAudio();
    setNeedUnlock(false);
    wsRef.current.send(
      JSON.stringify({
        type: "chat.send",
        body: text,
        name: guestName,
        product_id: productId ?? null,
      }),
    );
  }

  function sendChat() {
    const extra = chat.trim();
    if (!extra && !chatProduct) return;
    sendChatBody(extra || chatProduct?.name || "", chatProduct?.id ?? null);
    setChat("");
    setChatProduct(null);
  }

  function addProductToLiveChat(product: LiveProduct) {
    unlockLiveAudio();
    setNeedUnlock(false);
    setChatProduct(product);
    window.setTimeout(() => chatInputRef.current?.focus(), 0);
  }

  async function markPaid() {
    if (!order || !detailsReady(details)) return;
    setConfirming(true);
    try {
      await persistLiveOrder(sessionId, {
        items: order.items.map((item) => ({
          product_id: item.product_id,
          quantity: item.quantity,
        })),
        customer_name: details.name.trim(),
        customer_phone: details.phone.trim(),
        customer_address: details.address.trim(),
        customer_notes: details.notes.trim(),
      });
      setPaid(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not confirm order");
    } finally {
      setConfirming(false);
    }
  }

  function buy(product: LiveProduct) {
    setPaid(false);
    setCheckout(product);
    setCheckoutStep("details");
    setDetails(loadCheckoutDetails(guestName ?? ""));
  }

  if (!guestName) {
    return (
      <main className="relative h-[100dvh] overflow-hidden bg-slate-900">
        <LiveStage config={avatar} isTalking={false} mode="idle" mouthOpen={0} />
        <div className="relative z-20 flex h-full items-center justify-center px-4">
          <GuestNameGate
            assistantName={assistantName}
            onReady={(name) => {
              setNeedUnlock(false);
              setGuestName(name);
            }}
          />
        </div>
      </main>
    );
  }

  if (error && !session) {
    return (
      <main className="relative flex h-[100dvh] items-center justify-center overflow-hidden bg-slate-900 px-4">
        <LiveStage config={avatar} isTalking={false} mode="idle" mouthOpen={0} />
        <div className="relative z-20 w-full max-w-md rounded-3xl bg-white/95 p-6 text-center shadow-2xl ring-1 ring-white/40">
          <p className="text-xs font-semibold uppercase tracking-wide text-red-600">LORESCALE LIVE</p>
          <h1 className="mt-2 text-xl font-semibold text-slate-900">Not on air</h1>
          <p className="mt-2 text-sm text-slate-500">{error}</p>
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="relative flex h-[100dvh] items-center justify-center overflow-hidden bg-slate-900">
        <LiveStage config={avatar} isTalking={false} mode="greeting" mouthOpen={0} />
        <div className="relative z-20 size-10 animate-spin rounded-full border-2 border-red-200 border-t-red-500" />
      </main>
    );
  }

  const ended = session.status === "ended";

  return (
    <main className="relative h-[100dvh] overflow-hidden bg-slate-950 text-white">
      <LiveStage config={avatar} isTalking={isTalking} mode={avatarMode} mouthOpen={mouthOpen} />

      <header className="absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 px-4 py-3 lg:pr-[400px]">
        <div className="min-w-0 rounded-2xl bg-black/35 px-3 py-2 backdrop-blur-md">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-red-300">
            <span className={`size-2 rounded-full ${ended ? "bg-slate-400" : "animate-pulse bg-red-500"}`} />
            {ended ? "Ended" : "Live"} · {session.business_name}
          </p>
          <h1 className="truncate text-lg font-semibold">{session.title}</h1>
          <p className="text-xs text-white/70">{assistantName} is hosting</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="rounded-full bg-black/40 px-2.5 py-1 text-xs text-white/90 backdrop-blur-md">
            {session.viewer_count} watching
          </span>
          {needUnlock || audioBlocked ? (
            <button
              type="button"
              onPointerDown={enableSound}
              onClick={enableSound}
              className="inline-flex items-center gap-1.5 rounded-full bg-red-500 px-3 py-1.5 text-xs font-semibold text-white shadow-lg hover:bg-red-600"
            >
              <SpeakerWaveIcon className="size-3.5" aria-hidden />
              Tap to hear {assistantName}
            </button>
          ) : null}
        </div>
      </header>

      {ended ? (
        <p className="absolute inset-x-0 top-[4.75rem] z-20 mx-4 rounded-xl bg-black/55 px-3 py-2 text-sm text-white/80 backdrop-blur lg:right-[400px]">
          This LIVE has ended.
        </p>
      ) : null}

      {latestAi ? (
        <div className="absolute top-[28%] left-1/2 z-20 w-[min(88%,22rem)] -translate-x-1/2 rounded-2xl bg-black/50 px-4 py-3 text-center text-sm leading-relaxed text-white shadow-lg backdrop-blur-md lg:top-[32%] lg:left-[36%] lg:w-[min(28rem,38vw)]">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-orange-300">
            {latestAi.display_name}
          </p>
          <p className="mt-1">{latestAi.body}</p>
        </div>
      ) : null}

      {highlighted ? (
        <article className="absolute bottom-[36vh] left-3 z-20 hidden w-[17.5rem] overflow-hidden rounded-2xl bg-white text-slate-900 shadow-xl sm:block lg:bottom-6 lg:left-6">
          {highlighted.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={resolveMediaUrl(highlighted.image_url)}
              alt=""
              className="h-28 w-full object-cover"
            />
          ) : (
            <div className="h-16 bg-slate-100" />
          )}
          <div className="space-y-1.5 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-red-600">Featured</p>
            <h2 className="truncate text-sm font-semibold">{highlighted.name}</h2>
            <p className="text-sm font-bold">{formatCurrency(highlighted.price)}</p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={ended}
                onClick={() => addProductToLiveChat(highlighted)}
                className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:text-slate-400"
              >
                Add to live chat
              </button>
              <button
                type="button"
                disabled={ended}
                onClick={() => buy(highlighted)}
                className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-600 disabled:bg-slate-300"
              >
                Buy Now
              </button>
            </div>
          </div>
        </article>
      ) : null}

      {session.products.length > 1 ? (
        <div className="absolute inset-x-3 bottom-[36vh] z-20 hidden gap-2 overflow-x-auto pb-1 sm:flex lg:inset-x-auto lg:bottom-6 lg:left-[21.5rem] lg:right-[25.5rem] lg:max-w-[34vw]">
          {session.products.map((product) => (
            <button
              key={product.id}
              type="button"
              onClick={() => setHighlighted(product)}
              className="w-28 shrink-0 overflow-hidden rounded-xl bg-white/95 text-left text-slate-900 shadow"
            >
              {product.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={resolveMediaUrl(product.image_url)}
                  alt=""
                  className="h-16 w-full object-cover"
                />
              ) : (
                <div className="h-16 bg-slate-100" />
              )}
              <div className="p-2">
                <p className="truncate text-[11px] font-semibold">{product.name}</p>
                <p className="text-[10px] text-slate-500">{formatCurrency(product.price)}</p>
              </div>
            </button>
          ))}
        </div>
      ) : null}

      {highlighted ? (
        <div className="absolute inset-x-0 bottom-[34vh] z-20 flex items-center gap-3 bg-white/95 px-3 py-2 text-slate-900 sm:hidden">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{highlighted.name}</p>
            <p className="text-xs text-slate-500">{formatCurrency(highlighted.price)}</p>
          </div>
          <button
            type="button"
            disabled={ended}
            onClick={() => addProductToLiveChat(highlighted)}
            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 disabled:text-slate-400"
          >
            Add to live chat
          </button>
          <button
            type="button"
            disabled={ended}
            onClick={() => buy(highlighted)}
            className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-bold text-white disabled:bg-slate-300"
          >
            Buy Now
          </button>
        </div>
      ) : null}

      <section className="absolute inset-x-0 bottom-0 z-20 flex max-h-[34vh] flex-col bg-gradient-to-t from-slate-950 via-slate-950/92 to-slate-950/40 lg:inset-y-0 lg:left-auto lg:right-0 lg:h-auto lg:max-h-none lg:w-[380px] lg:bg-gradient-to-l lg:from-slate-950 lg:via-slate-950/88 lg:to-transparent">
        <div className="border-b border-white/10 px-4 py-3">
          <h2 className="text-sm font-semibold">Live chat</h2>
          <p className="text-xs text-white/50">Ask {assistantName} about price or what to buy.</p>
        </div>
        <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3">
          {chatMessages.map((message) => {
            const tagged = session.products.find((product) => product.id === message.product_id);
            const extra = tagged ? messageExtraText(message.body, tagged.name) : message.body;
            return (
              <div key={message.id} className="text-sm">
                <span
                  className={
                    message.role === "host"
                      ? "font-semibold text-amber-200"
                      : "font-semibold text-white/80"
                  }
                >
                  {message.display_name}
                </span>{" "}
                {tagged ? <ProductChip name={tagged.name} /> : null}
                {extra ? (
                  <span className={tagged ? "ml-1 text-white/80" : "text-white/80"}>{extra}</span>
                ) : null}
              </div>
            );
          })}
        </div>
        <form
          className="flex gap-2 border-t border-white/10 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            sendChat();
          }}
        >
          <div
            className="flex min-w-0 flex-1 items-center gap-1.5 rounded-xl border border-white/10 bg-white/10 px-2 py-1.5 focus-within:border-red-400"
            onClick={() => chatInputRef.current?.focus()}
          >
            {chatProduct ? (
              <ProductChip name={chatProduct.name} onRemove={() => setChatProduct(null)} />
            ) : null}
            <input
              ref={chatInputRef}
              className="min-w-0 flex-1 bg-transparent px-1 py-0.5 text-sm outline-none"
              value={chat}
              disabled={ended}
              onChange={(event) => setChat(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
                event.preventDefault();
                sendChat();
              }}
              placeholder={
                ended ? "LIVE ended" : chatProduct ? "Ask about this…" : `Ask ${assistantName}…`
              }
              maxLength={500}
            />
          </div>
          <button
            type="submit"
            disabled={ended || (!chat.trim() && !chatProduct)}
            className="rounded-xl bg-red-500 px-3 text-white disabled:bg-white/10"
          >
            <PaperAirplaneIcon className="size-4" aria-hidden />
          </button>
        </form>
      </section>

      {checkout && order ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-4 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl bg-slate-100 p-4 text-slate-900">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Buy {checkout.name}</h2>
              <button type="button" onClick={() => setCheckout(null)} aria-label="Close checkout">
                <XMarkIcon className="size-5" />
              </button>
            </div>
            {paid ? (
              <p className="rounded-2xl bg-white px-4 py-6 text-center text-sm font-medium text-emerald-700">
                Order sent. Staff will confirm your payment.
              </p>
            ) : confirming ? (
              <p className="py-8 text-center text-sm text-slate-500">Confirming order…</p>
            ) : checkoutStep === "details" ? (
              <CheckoutDetailsForm
                productName={checkout.name}
                details={details}
                onChange={setDetails}
                onContinue={() => {
                  window.localStorage.setItem(DETAILS_KEY, JSON.stringify(details));
                  setCheckoutStep("pay");
                }}
              />
            ) : (
              <>
                <div className="mb-3 rounded-2xl bg-white px-3 py-2.5 text-sm text-slate-600">
                  <p className="font-medium text-slate-900">{details.name}</p>
                  <p>{details.phone}</p>
                  <p>{details.address}</p>
                  {details.notes ? <p className="text-slate-500">{details.notes}</p> : null}
                  <button
                    type="button"
                    className="mt-1 text-xs font-semibold text-red-600"
                    onClick={() => setCheckoutStep("details")}
                  >
                    Edit details
                  </button>
                </div>
                <PaymentStep
                  order={order}
                  onPaid={() => void markPaid()}
                  onExpired={() => setCheckout(null)}
                />
              </>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}
