"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useSessionStore, type FlyAnimationRequest } from "@/store/session-store";

export const basketButtonRef: { current: HTMLButtonElement | null } = { current: null };

const ITEM_SIZE = 200;
const ANIMATION_MS = 2200;

const FLIGHT_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

function getStartPoint(fromRect?: DOMRectReadOnly): { x: number; y: number } {
  if (fromRect) {
    return {
      x: fromRect.left + fromRect.width / 2,
      y: fromRect.top + fromRect.height / 2,
    };
  }

  return {
    x: window.innerWidth - ITEM_SIZE / 2 - 32,
    y: window.innerHeight * 0.42,
  };
}

function quadraticBezier(t: number, p0: number, p1: number, p2: number): number {
  const inv = 1 - t;
  return inv * inv * p0 + 2 * inv * t * p1 + t * t * p2;
}

function buildArcKeyframes(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): Keyframe[] {
  const dx = endX - startX;
  const dy = endY - startY;
  const distance = Math.hypot(dx, dy);

  const controlX = startX + dx * 0.42;
  const controlY = startY + dy * 0.38 - Math.min(160, distance * 0.42);

  const steps = 16;
  const keyframes: Keyframe[] = [];

  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = quadraticBezier(t, startX, controlX, endX);
    const y = quadraticBezier(t, startY, controlY, endY);

    const appear = Math.min(1, t / 0.16);
    const travel = Math.max(0, (t - 0.16) / 0.84);
    const scale = t < 0.16 ? 0.55 + appear * 0.45 : 1 - travel * 0.68;
    const opacity = t < 0.1 ? t / 0.1 : t > 0.9 ? 1 - (t - 0.9) / 0.1 : 1;
    const rotate = Math.sin(t * Math.PI) * -8 * (1 - t);
    const blur = t < 0.14 ? (1 - appear) * 5 : 0;
    const shadowSpread = 18 + (1 - t) * 28;
    const shadowAlpha = 0.12 + (1 - t) * 0.16;

    keyframes.push({
      offset: t,
      left: `${x}px`,
      top: `${y}px`,
      opacity,
      filter: blur > 0.1 ? `blur(${blur}px)` : "blur(0px)",
      boxShadow: `0 ${shadowSpread * 0.35}px ${shadowSpread}px rgba(249, 115, 22, ${shadowAlpha * 0.35}), 0 ${shadowSpread * 0.2}px ${shadowSpread * 0.6}px rgba(15, 23, 42, ${shadowAlpha})`,
      transform: `translate(-50%, -50%) scale(${scale}) rotate(${rotate}deg)`,
    });
  }

  return keyframes;
}

function createFlyElement(request: FlyAnimationRequest): HTMLDivElement {
  const flyEl = document.createElement("div");
  flyEl.className =
    "pointer-events-none fixed z-[250] overflow-hidden rounded-2xl border-[3px] border-white/95 bg-white shadow-lg";
  flyEl.style.width = `${ITEM_SIZE}px`;
  flyEl.style.height = `${ITEM_SIZE}px`;
  flyEl.style.left = "0px";
  flyEl.style.top = "0px";
  flyEl.style.transform = "translate(-50%, -50%) scale(0.55)";
  flyEl.style.opacity = "0";
  flyEl.style.willChange = "left, top, transform, opacity";

  if (request.imageUrl) {
    const img = document.createElement("img");
    img.src = request.imageUrl;
    img.alt = request.name;
    img.className = "h-full w-full object-cover";
    img.draggable = false;
    img.referrerPolicy = "no-referrer";
    flyEl.appendChild(img);
  } else {
    flyEl.className +=
      " flex items-center justify-center bg-gradient-to-br from-orange-50 to-amber-100 text-5xl";
    flyEl.textContent = "☕";
  }

  return flyEl;
}

function getBasketTarget(): HTMLButtonElement | null {
  return basketButtonRef.current ?? document.querySelector<HTMLButtonElement>("[data-basket-target]");
}

function runBasketAnimation(
  flyEl: HTMLDivElement,
  start: { x: number; y: number },
  basketEl: HTMLButtonElement,
  onComplete: () => void,
) {
  const basketRect = basketEl.getBoundingClientRect();
  const endX = basketRect.left + basketRect.width / 2;
  const endY = basketRect.top + basketRect.height / 2;

  flyEl.style.left = `${start.x}px`;
  flyEl.style.top = `${start.y}px`;

  const animation = flyEl.animate(buildArcKeyframes(start.x, start.y, endX, endY), {
    duration: ANIMATION_MS,
    easing: FLIGHT_EASING,
    fill: "forwards",
  });

  const finish = () => {
    flyEl.remove();
    basketEl.classList.add("basket-bump");
    window.setTimeout(() => basketEl.classList.remove("basket-bump"), 450);
    onComplete();
  };

  if (animation.playState === "finished") {
    finish();
    return () => flyEl.remove();
  }

  animation.onfinish = finish;
  animation.oncancel = finish;

  return () => {
    animation.cancel();
    flyEl.remove();
  };
}

interface FlyingProductProps {
  request: FlyAnimationRequest;
  onComplete: (id: string) => void;
}

function FlyingProduct({ request, onComplete }: FlyingProductProps) {
  const requestRef = useRef(request);
  requestRef.current = request;

  useEffect(() => {
    let cancelled = false;
    let cleanupAnimation: (() => void) | undefined;
    let retryTimer: number | undefined;
    let attempts = 0;
    const animationId = request.id;

    const startAnimation = () => {
      if (cancelled) return;

      const basketEl = getBasketTarget();
      if (!basketEl) {
        attempts += 1;
        if (attempts < 30) {
          retryTimer = window.setTimeout(startAnimation, 80);
        } else {
          onComplete(animationId);
        }
        return;
      }

      const activeRequest = requestRef.current;
      const start = getStartPoint(activeRequest.fromRect);
      const flyEl = createFlyElement(activeRequest);
      document.body.appendChild(flyEl);

      cleanupAnimation = runBasketAnimation(flyEl, start, basketEl, () => {
        if (!cancelled) onComplete(animationId);
      });
    };

    const frame = requestAnimationFrame(startAnimation);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      if (retryTimer) window.clearTimeout(retryTimer);
      cleanupAnimation?.();
    };
  }, [onComplete, request.id]);

  return null;
}

export function FlyToBasketLayer() {
  const flyAnimations = useSessionStore((s) => s.flyAnimations);
  const completeFlyAnimation = useSessionStore((s) => s.completeFlyAnimation);
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  if (!portalReady) return null;

  return createPortal(
    <>
      {flyAnimations.map((request) => (
        <FlyingProduct
          key={request.id}
          request={request}
          onComplete={completeFlyAnimation}
        />
      ))}
    </>,
    document.body,
  );
}
