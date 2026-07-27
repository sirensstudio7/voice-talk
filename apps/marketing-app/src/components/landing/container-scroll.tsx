"use client";

import React, { useMemo, useRef, type ReactNode } from "react";
import { motion, useScroll, useTransform, type MotionValue } from "framer-motion";

export function ContainerScroll({
  titleComponent,
  children,
}: {
  titleComponent: string | ReactNode;
  children: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
  });
  // Keep the first render SSR-safe; resolve viewport after mount.
  const [isMobile, setIsMobile] = React.useState(false);
  const [reduceMotion, setReduceMotion] = React.useState(false);

  React.useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 768px)");
    const update = () => setIsMobile(mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  React.useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  const motionRanges = useMemo(() => {
    if (reduceMotion) {
      return {
        rotate: [0, 0] as [number, number],
        scale: [1, 1] as [number, number],
        translate: [0, 0] as [number, number],
      };
    }
    if (isMobile) {
      return {
        rotate: [18, 0] as [number, number],
        scale: [1.04, 1] as [number, number],
        translate: [0, -56] as [number, number],
      };
    }
    return {
      rotate: [20, 0] as [number, number],
      scale: [1.05, 1] as [number, number],
      translate: [0, -100] as [number, number],
    };
  }, [isMobile, reduceMotion]);

  const rotate = useTransform(scrollYProgress, [0, 1], motionRanges.rotate);
  const scale = useTransform(scrollYProgress, [0, 1], motionRanges.scale);
  const translate = useTransform(scrollYProgress, [0, 1], motionRanges.translate);

  return (
    <div
      className="relative flex min-h-[100svh] flex-col py-4 sm:py-8 md:min-h-0 md:h-[80rem] md:items-center md:justify-center md:p-20"
      ref={containerRef}
    >
      <div
        className="relative w-full md:py-40"
        style={{
          perspective: reduceMotion ? undefined : isMobile ? "900px" : "1000px",
        }}
      >
        <Header translate={translate} titleComponent={titleComponent} />
        <Card rotate={rotate} scale={scale} reduceMotion={reduceMotion}>
          {children}
        </Card>
      </div>
    </div>
  );
}

function Header({
  translate,
  titleComponent,
}: {
  translate: MotionValue<number>;
  titleComponent: string | ReactNode;
}) {
  return (
    <motion.div
      style={{
        translateY: translate,
      }}
      className="relative z-10 mx-auto mb-4 max-w-5xl text-center sm:mb-8 md:mb-16"
    >
      {titleComponent}
    </motion.div>
  );
}

function Card({
  rotate,
  scale,
  reduceMotion,
  children,
}: {
  rotate: MotionValue<number>;
  scale: MotionValue<number>;
  reduceMotion: boolean;
  children: ReactNode;
}) {
  return (
    <motion.div
      style={{
        rotateX: reduceMotion ? 0 : rotate,
        scale: reduceMotion ? 1 : scale,
      }}
      className="hero-scroll-card relative z-0 mx-auto mt-4 w-full max-w-5xl rounded-2xl border-2 border-[#6C6C6C] bg-[#222222] p-3 sm:mt-4 sm:rounded-[24px] sm:border-[3px] sm:p-2 md:mt-8 md:rounded-[30px] md:border-4 md:p-6"
    >
      <div className="h-full w-full overflow-hidden rounded-xl bg-gray-100 sm:rounded-2xl md:rounded-2xl md:p-4 dark:bg-zinc-900">
        {children}
      </div>
    </motion.div>
  );
}
