"use client";

import * as Color from "color-bits";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from '@voicetalk/ui';

const CANVAS_FONT_FAMILY =
  'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

export const getRGBA = (
  cssColor: React.CSSProperties["color"],
  fallback: string = "rgba(180, 180, 180)",
): string => {
  if (typeof window === "undefined") return fallback;
  if (!cssColor) return fallback;

  try {
    if (typeof cssColor === "string" && cssColor.startsWith("var(")) {
      const element = document.createElement("div");
      element.style.color = cssColor;
      document.body.appendChild(element);
      const computedColor = window.getComputedStyle(element).color;
      document.body.removeChild(element);
      return Color.formatRGBA(Color.parse(computedColor));
    }

    return Color.formatRGBA(Color.parse(cssColor));
  } catch (e) {
    console.error("Color parsing failed:", e);
    return fallback;
  }
};

export const colorWithOpacity = (color: string, opacity: number): string => {
  try {
    return Color.formatRGBA(Color.alpha(Color.parse(color), opacity));
  } catch {
    if (!color.startsWith("rgb")) return color;
    return Color.formatRGBA(Color.alpha(Color.parse(color), opacity));
  }
};

interface FlickeringGridProps extends React.HTMLAttributes<HTMLDivElement> {
  squareSize?: number;
  gridGap?: number;
  flickerChance?: number;
  color?: string;
  width?: number;
  height?: number;
  className?: string;
  maxOpacity?: number;
  text?: string;
  fontSize?: number;
  fontWeight?: number | string;
  /** Vertical anchor for text, 0 = top, 0.5 = center, 1 = bottom */
  textYRatio?: number;
  /** Scale text down to fit container width/height; fontSize acts as the max size */
  fitText?: boolean;
  minFontSize?: number;
}

type GridParams = {
  cols: number;
  rows: number;
  squares: Float32Array;
  textMask: Uint8Array;
  dpr: number;
};

function getCanvasFont(fontWeight: number | string, fontSize: number) {
  return `${fontWeight} ${fontSize}px ${CANVAS_FONT_FAMILY}`;
}

async function ensureCanvasFonts(fontWeight: number | string, fontSize: number) {
  if (!document.fonts?.load) {
    if (document.fonts?.ready) await document.fonts.ready;
    return;
  }

  await Promise.all([
    document.fonts.load(getCanvasFont(fontWeight, 16)),
    document.fonts.load(getCanvasFont(fontWeight, fontSize)),
  ]).catch(() => undefined);

  if (document.fonts.ready) await document.fonts.ready;
}

function measureTextWidth(text: string, fontSize: number, fontWeight: number | string) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return text.length * fontSize * 0.55;

  ctx.font = getCanvasFont(fontWeight, fontSize);
  return ctx.measureText(text).width;
}

function computeFitFontSize(
  text: string,
  fontWeight: number | string,
  containerWidth: number,
  containerHeight: number,
  maxFontSize: number,
  minFontSize: number,
) {
  const widthBudget = containerWidth * 0.94;
  const heightBudget = containerHeight * 0.78;

  let size = maxFontSize;
  let width = measureTextWidth(text, size, fontWeight);

  while (width > widthBudget && size > minFontSize) {
    size -= 2;
    width = measureTextWidth(text, size, fontWeight);
  }

  const heightLimit = Math.floor(heightBudget / 0.72);
  size = Math.min(size, heightLimit);

  return Math.max(minFontSize, Math.floor(size));
}

function buildTextMask(
  cols: number,
  rows: number,
  canvasWidth: number,
  canvasHeight: number,
  dpr: number,
  text: string,
  fontSize: number,
  fontWeight: number | string,
  squareSize: number,
  gridGap: number,
  textYRatio: number,
) {
  const textMask = new Uint8Array(cols * rows);
  if (!text) return textMask;

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = canvasWidth;
  maskCanvas.height = canvasHeight;
  const maskCtx = maskCanvas.getContext("2d", { willReadFrequently: true });
  if (!maskCtx) return textMask;

  maskCtx.save();
  maskCtx.scale(dpr, dpr);
  maskCtx.fillStyle = "white";
  maskCtx.font = getCanvasFont(fontWeight, fontSize);
  maskCtx.textAlign = "center";
  maskCtx.textBaseline = "middle";
  maskCtx.fillText(
    text,
    canvasWidth / (2 * dpr),
    (canvasHeight / dpr) * textYRatio,
  );
  maskCtx.restore();

  const cellSize = squareSize * dpr;
  const cellStep = (squareSize + gridGap) * dpr;
  const { data: fullData } = maskCtx.getImageData(0, 0, canvasWidth, canvasHeight);
  const rowStride = canvasWidth * 4;

  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const x = i * cellStep;
      const y = j * cellStep;
      let hasText = false;

      for (let py = 0; py < cellSize && !hasText; py++) {
        const rowOffset = (y + py) * rowStride;
        for (let px = 0; px < cellSize; px++) {
          if (fullData[rowOffset + (x + px) * 4 + 3] > 0) {
            hasText = true;
            break;
          }
        }
      }

      textMask[i * rows + j] = hasText ? 1 : 0;
    }
  }

  return textMask;
}

export const FlickeringGrid: React.FC<FlickeringGridProps> = ({
  squareSize = 3,
  gridGap = 3,
  flickerChance = 0.2,
  color = "#B4B4B4",
  width,
  height,
  className,
  maxOpacity = 0.15,
  text = "",
  fontSize = 140,
  fontWeight = 600,
  textYRatio = 0.5,
  fitText = false,
  minFontSize = 40,
  ...props
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const gridParamsRef = useRef<GridParams | null>(null);
  const isInViewRef = useRef(true);
  const [ready, setReady] = useState(false);

  const memoizedColor = useMemo(() => getRGBA(color), [color]);

  const drawGrid = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      canvasWidth: number,
      canvasHeight: number,
      cols: number,
      rows: number,
      squares: Float32Array,
      textMask: Uint8Array,
      dpr: number,
    ) => {
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);

      const cellSize = squareSize * dpr;
      const cellStep = (squareSize + gridGap) * dpr;

      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const index = i * rows + j;
          const opacity = squares[index];
          const hasText = textMask[index] === 1;
          const finalOpacity = hasText ? Math.min(1, opacity * 3 + 0.4) : opacity;
          if (finalOpacity <= 0) continue;

          ctx.fillStyle = colorWithOpacity(memoizedColor, finalOpacity);
          ctx.fillRect(i * cellStep, j * cellStep, cellSize, cellSize);
        }
      }
    },
    [memoizedColor, squareSize, gridGap],
  );

  const setupCanvas = useCallback(
    (canvas: HTMLCanvasElement, canvasWidth: number, canvasHeight: number) => {
      if (canvasWidth <= 0 || canvasHeight <= 0) return null;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(canvasWidth * dpr);
      canvas.height = Math.floor(canvasHeight * dpr);
      canvas.style.width = `${canvasWidth}px`;
      canvas.style.height = `${canvasHeight}px`;

      const effectiveFontSize =
        fitText && text
          ? computeFitFontSize(
              text,
              fontWeight,
              canvasWidth,
              canvasHeight,
              fontSize,
              minFontSize,
            )
          : fontSize;

      const cols = Math.ceil(canvasWidth / (squareSize + gridGap));
      const rows = Math.ceil(canvasHeight / (squareSize + gridGap));
      const textMask = buildTextMask(
        cols,
        rows,
        canvas.width,
        canvas.height,
        dpr,
        text,
        effectiveFontSize,
        fontWeight,
        squareSize,
        gridGap,
        textYRatio,
      );

      const textCellCount = textMask.reduce((sum, value) => sum + value, 0);
      const squares = new Float32Array(cols * rows);
      for (let i = 0; i < squares.length; i++) {
        squares[i] = Math.random() * maxOpacity;
      }

      return { cols, rows, squares, textMask, dpr };
    },
    [squareSize, gridGap, maxOpacity, text, fontSize, fontWeight, textYRatio, fitText, minFontSize],
  );

  const updateSquares = useCallback(
    (squares: Float32Array, deltaTime: number) => {
      for (let i = 0; i < squares.length; i++) {
        if (Math.random() < flickerChance * deltaTime) {
          squares[i] = Math.random() * maxOpacity;
        }
      }
    },
    [flickerChance, maxOpacity],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let animationFrameId = 0;
    let retryFrameId = 0;
    let lastTime = 0;
    let cancelled = false;

    const paint = () => {
      const gridParams = gridParamsRef.current;
      if (!gridParams) return;

      drawGrid(
        ctx,
        canvas.width,
        canvas.height,
        gridParams.cols,
        gridParams.rows,
        gridParams.squares,
        gridParams.textMask,
        gridParams.dpr,
      );
    };

    const updateCanvasSize = async () => {
      const rect = container.getBoundingClientRect();
      const newWidth = width ?? rect.width;
      const newHeight = height ?? rect.height;

      if (newWidth <= 0 || newHeight <= 0) {
        retryFrameId = requestAnimationFrame(() => {
          void updateCanvasSize();
        });
        return;
      }

      await ensureCanvasFonts(fontWeight, fontSize);
      if (cancelled) return;

      gridParamsRef.current = setupCanvas(canvas, newWidth, newHeight);

      if (!gridParamsRef.current) {
        retryFrameId = requestAnimationFrame(() => {
          void updateCanvasSize();
        });
        return;
      }

      setReady(true);
      paint();

      if (text && gridParamsRef.current.textMask.every((cell) => cell === 0)) {
        retryFrameId = requestAnimationFrame(() => {
          void updateCanvasSize();
        });
      }
    };

    const animate = (time: number) => {
      if (cancelled) return;

      const gridParams = gridParamsRef.current;
      if (gridParams && isInViewRef.current) {
        const deltaTime = lastTime === 0 ? 0 : (time - lastTime) / 1000;
        lastTime = time;
        updateSquares(gridParams.squares, deltaTime);
        paint();
      } else {
        lastTime = 0;
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    void updateCanvasSize();
    animationFrameId = requestAnimationFrame(animate);

    const resizeObserver = new ResizeObserver(() => {
      void updateCanvasSize();
    });
    resizeObserver.observe(container);

    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        isInViewRef.current = entry.isIntersecting;
      },
      { threshold: 0, rootMargin: "200px" },
    );
    intersectionObserver.observe(container);

    const onFontLoadingDone = () => {
      void updateCanvasSize();
    };
    document.fonts?.addEventListener?.("loadingdone", onFontLoadingDone);

    return () => {
      cancelled = true;
      cancelAnimationFrame(animationFrameId);
      cancelAnimationFrame(retryFrameId);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.fonts?.removeEventListener?.("loadingdone", onFontLoadingDone);
    };
  }, [setupCanvas, updateSquares, drawGrid, width, height, text, fontSize, fontWeight, fitText, minFontSize]);

  return (
    <div ref={containerRef} className={cn("h-full w-full", className)} {...props}>
      <canvas
        ref={canvasRef}
        className={cn("pointer-events-none h-full w-full", !ready && "opacity-0")}
      />
    </div>
  );
};
