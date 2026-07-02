"use client";

import { ChevronRight, ShoppingBag } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef } from "react";

import { useSessionStore } from "@/store/session-store";

export function TranscriptPanel() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { transcript, order } = useSessionStore();
  const hasOrder = order.items.length > 0;

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [transcript]);

  return (
    <div className="flex max-h-[min(600px,100%)] min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-lg backdrop-blur-sm">
      <div className="shrink-0 border-b border-slate-100 px-4 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Conversation
        </p>
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

      {hasOrder ? (
        <div className="shrink-0 border-t border-slate-100 px-3 py-3">
          <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-600">
              <ShoppingBag className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Live Order
              </p>
              <p className="truncate text-sm font-semibold text-slate-900">
                {order.items
                  .map((item) => `${item.quantity}x ${item.name}`)
                  .join(", ")}
              </p>
              <p className="text-xs text-slate-600">
                ${order.total.toFixed(2)} · {order.status}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
