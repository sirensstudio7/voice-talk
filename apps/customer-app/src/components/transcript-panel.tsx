"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";

import { LanguageToggle } from "@/components/voice-controls";
import { useSessionStore } from "@/store/session-store";
import { AiLanguage } from "@/types/voice";

type TranscriptPanelProps = {
  onLanguageChange: (language: AiLanguage) => void;
};

export function TranscriptPanel({ onLanguageChange }: TranscriptPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { transcript, language } = useSessionStore();

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [transcript]);

  return (
    <div className="flex max-h-[min(600px,100%)] min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-lg backdrop-blur-sm">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Conversation
        </p>
        <LanguageToggle value={language} onChange={onLanguageChange} />
      </div>

      <div
        ref={scrollRef}
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-y-contain px-3 py-3"
      >
        {transcript.length === 0 ? (
          <p className="px-1 text-sm leading-relaxed text-slate-600">
            Hold the mic and say something like &quot;I&apos;d like a latte and a
            croissant.&quot;
          </p>
        ) : (
          transcript.map((message, index) => {
            const isUser = message.role === "user";
            const showAvatar =
              !isUser &&
              (index === 0 || transcript[index - 1]?.role === "user");

            return (
              <div
                key={message.id}
                className={`flex items-end gap-2 ${isUser ? "flex-row-reverse" : "flex-row"}`}
              >
                {!isUser && showAvatar ? (
                  <div className="relative h-7 w-7 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                    <Image
                      src="/eva-cashier-nobg.png"
                      alt="Eva"
                      width={28}
                      height={28}
                      className="h-full w-full object-cover object-top"
                    />
                  </div>
                ) : !isUser ? (
                  <div className="w-7 shrink-0" />
                ) : null}

                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                    isUser
                      ? "bg-orange-500 text-white"
                      : "bg-slate-100 text-slate-900"
                  }`}
                >
                  {message.text}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
