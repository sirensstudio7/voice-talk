"use client";

import { HeroLorescaleAvatar } from "@/components/landing/hero-lorescale-avatar";
import {
  BookOpen,
  Home,
  Keyboard,
  Mic,
  MoreHorizontal,
  Share,
  ShoppingBasket,
} from "lucide-react";
import Image from "next/image";

const DEFAULT_BOTTOM_GRADIENT =
  "linear-gradient(to top, rgb(241 245 249) 0%, rgba(241, 245, 249, 0.98) 10%, rgba(241, 245, 249, 0.88) 22%, rgba(241, 245, 249, 0.68) 38%, rgba(241, 245, 249, 0.42) 54%, rgba(241, 245, 249, 0.18) 70%, rgba(241, 245, 249, 0.04) 84%, rgba(241, 245, 249, 0) 100%)";

export function HeroVoicePreview() {
  return (
    <div
      className="hero-voice-preview pointer-events-none relative aspect-[1140/774] w-full select-none overflow-hidden bg-slate-100"
      aria-hidden
    >
      <div className="absolute inset-0">
        <HeroLorescaleAvatar />
      </div>

      <div
        className="absolute inset-x-0 bottom-0 z-10 h-[min(52vh,36rem)]"
        style={{ background: DEFAULT_BOTTOM_GRADIENT }}
      />

      <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-5 pt-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-md">
          <Home className="h-4 w-4" />
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-2 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_12px_rgba(15,23,42,0.06),0_12px_28px_rgba(15,23,42,0.05)]">
            <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-slate-100">
              <Image
                src="/lorescale-cashier-nobg.png"
                alt=""
                width={32}
                height={32}
                className="h-full w-full object-cover object-top"
              />
              <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border-2 border-white bg-slate-400" />
            </div>
            <p className="flex items-center gap-0.5 whitespace-nowrap pr-0.5 text-[11px] font-semibold leading-none text-slate-900">
              Lorescale
              <span className="font-normal text-slate-400">·</span>
              <span className="font-medium text-slate-600">Ready</span>
            </p>
          </div>

          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-md">
            <ShoppingBasket className="h-4 w-4" />
          </div>

          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-md">
            <MoreHorizontal className="h-4 w-4" />
          </div>
        </div>
      </header>

      <div className="absolute inset-x-0 bottom-0 top-[14%] z-30 flex items-end justify-start px-6 pb-[calc(2rem+4.5rem+1.5rem)]">
        <div className="flex max-h-full min-h-0 w-72 max-w-[calc(100vw-3rem)] flex-col">
          <div className="flex max-h-[min(600px,100%)] min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-lg backdrop-blur-sm">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Conversation
              </p>
              <div className="inline-flex items-center rounded-full border border-slate-200 bg-white p-0.5 shadow-md">
                <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                  ID
                </span>
                <span className="rounded-full bg-orange-500 px-2.5 py-1 text-[11px] font-semibold text-white shadow-[0_1px_4px_rgba(249,115,22,0.45)]">
                  EN
                </span>
              </div>
            </div>
            <div className="px-3 py-3">
              <p className="px-1 text-sm leading-relaxed text-slate-600">
                Hold the mic and say something like &quot;I&apos;d like a latte and a croissant.&quot;
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-[9.5rem] z-20 flex flex-col items-center gap-3 px-6">
        <div
          className="inline-flex items-center justify-center rounded-full px-6 py-3 text-[15px] font-medium text-white"
          style={{
            background: "rgb(249, 115, 22)",
            boxShadow: "rgba(255, 255, 255, 0.35) 0px 2.5px 5px 0px inset",
          }}
        >
          Order Now
        </div>
      </div>

      <footer className="absolute inset-x-0 bottom-0 z-20 flex items-end justify-center gap-6 px-6 pb-8 pt-16">
        <div className="absolute bottom-8 right-6 z-10 flex items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_12px_rgba(15,23,42,0.06),0_12px_28px_rgba(15,23,42,0.05)] backdrop-blur-sm">
          <BookOpen className="h-4 w-4 text-orange-500" />
          Menu
        </div>

        <div className="relative z-10 flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_12px_rgba(15,23,42,0.06),0_12px_28px_rgba(15,23,42,0.05)]">
          <Keyboard className="h-5 w-5" />
        </div>

        <div className="relative inline-flex h-[4.5rem] w-[4.5rem] items-center justify-center">
          <span className="hero-voice-preview__mic-pulse" aria-hidden />
          <span className="hero-voice-preview__mic-pulse hero-voice-preview__mic-pulse--delay" aria-hidden />
          <div
            className="relative z-10 inline-flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full text-white"
            style={{
              background: "rgb(249, 115, 22)",
              boxShadow: "rgba(255, 255, 255, 0.35) 0px 2.5px 5px 0px inset",
            }}
          >
            <Mic className="h-7 w-7" />
          </div>
        </div>

        <div className="relative z-10 flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_12px_rgba(15,23,42,0.06),0_12px_28px_rgba(15,23,42,0.05)]">
          <Share className="h-5 w-5" />
        </div>
      </footer>
    </div>
  );
}
