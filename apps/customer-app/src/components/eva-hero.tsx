"use client";

import dynamic from "next/dynamic";
import { Component, Suspense, type ReactNode } from "react";

const EvaAvatar3D = dynamic(
  () => import("./eva-avatar-3d").then((mod) => ({ default: mod.EvaAvatar3D })),
  { ssr: false },
);

type EvaHeroProps = {
  isTalking: boolean;
};

// Bottom-center portrait hero frame. Mask fades out feet without overlaying the face.
const HERO_FRAME_CLASS =
  "absolute bottom-12 left-1/2 aspect-[2/3] h-[120vh] max-h-none max-w-[100vw] -translate-x-1/2 [mask-image:linear-gradient(to_bottom,black_0%,black_78%,transparent_94%)] [-webkit-mask-image:linear-gradient(to_bottom,black_0%,black_78%,transparent_94%)]";

function EvaHeroFallback() {
  return (
    <div className="flex h-full w-full items-end justify-center pb-8">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-orange-200 border-t-orange-500" />
        <p className="text-sm font-medium text-slate-500">Loading Eva…</p>
      </div>
    </div>
  );
}

function EvaHeroPngFallback() {
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src="/eva-cashier-nobg.png"
      alt="Eva, AI Cashier at Sunrise Coffee"
      className="h-full w-full object-contain object-bottom"
    />
  );
}

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

class EvaHeroErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return <EvaHeroPngFallback />;
    }

    return this.props.children;
  }
}

export function EvaHero({ isTalking }: EvaHeroProps) {
  return (
    <EvaHeroErrorBoundary>
      <div
        className={`${HERO_FRAME_CLASS} ${isTalking ? "avatar-talking" : ""}`}
        aria-label="Eva, AI Cashier at Sunrise Coffee"
        role="img"
      >
        <Suspense fallback={<EvaHeroFallback />}>
          <div className="h-full w-full">
            <EvaAvatar3D isTalking={isTalking} />
          </div>
        </Suspense>
      </div>
    </EvaHeroErrorBoundary>
  );
}
