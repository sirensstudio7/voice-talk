"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  ChatBubbleLeftRightIcon,
  CommandLineIcon,
  FlagIcon,
  PuzzlePieceIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";

import { cn } from "@/lib/cn";

export type RuleNodeKind = "start" | "tool" | "action" | "addon" | "end";

export type RuleNode = {
  id: string;
  label: string;
  hint: string;
  kind: RuleNodeKind;
  tool?: string;
  builtIn?: boolean;
  x: number;
  y: number;
};

export const RULE_NODE_W = 176;
export const RULE_NODE_H = 64;

export type RuleEdge = {
  from: string;
  to: string;
  label?: string;
};

const NODE_W = RULE_NODE_W;
const NODE_H = RULE_NODE_H;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 2;
const ZOOM_STEP = 1.15;

function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function KindIcon({ kind }: { kind: RuleNodeKind }) {
  const className = "size-3.5";
  if (kind === "start") return <SparklesIcon className={className} />;
  if (kind === "end") return <FlagIcon className={className} />;
  if (kind === "addon") return <PuzzlePieceIcon className={className} />;
  if (kind === "tool") return <CommandLineIcon className={className} />;
  return <ChatBubbleLeftRightIcon className={className} />;
}

function nodeChrome(kind: RuleNodeKind, selected: boolean) {
  const ring = selected ? "ring-2 ring-orange-500 shadow-md" : "ring-1 ring-black/5 shadow-sm";
  if (kind === "start") return `${ring} bg-orange-50 text-orange-950`;
  if (kind === "end") return `${ring} bg-slate-900 text-white`;
  if (kind === "addon") return `${ring} bg-amber-50 text-amber-950`;
  return `${ring} bg-white text-slate-900`;
}

function iconWrap(kind: RuleNodeKind) {
  if (kind === "start") return "bg-orange-500 text-white";
  if (kind === "end") return "bg-white/15 text-white";
  if (kind === "addon") return "bg-amber-500 text-white";
  if (kind === "tool") return "bg-slate-900 text-white";
  return "bg-slate-100 text-slate-600";
}

function anchors(from: RuleNode, to: RuleNode) {
  const fc = { x: from.x + NODE_W / 2, y: from.y + NODE_H / 2 };
  const tc = { x: to.x + NODE_W / 2, y: to.y + NODE_H / 2 };
  const dx = tc.x - fc.x;
  const dy = tc.y - fc.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx >= 0) {
      return { x1: from.x + NODE_W, y1: fc.y, x2: to.x, y2: tc.y };
    }
    return { x1: from.x, y1: fc.y, x2: to.x + NODE_W, y2: tc.y };
  }
  if (dy >= 0) {
    return { x1: fc.x, y1: from.y + NODE_H, x2: tc.x, y2: to.y };
  }
  return { x1: fc.x, y1: from.y, x2: tc.x, y2: to.y + NODE_H };
}

function curve({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  const mx = (x2 - x1) / 2;
  const my = (y2 - y1) / 2;
  if (Math.abs(x2 - x1) >= Math.abs(y2 - y1)) {
    return `M ${x1} ${y1} C ${x1 + mx} ${y1}, ${x2 - mx} ${y2}, ${x2} ${y2}`;
  }
  return `M ${x1} ${y1} C ${x1} ${y1 + my}, ${x2} ${y2 - my}, ${x2} ${y2}`;
}

export type KioskRuleGraphHandle = {
  zoomIn: () => void;
  zoomOut: () => void;
  fitView: () => void;
  getScale: () => number;
};

export const KioskRuleGraph = forwardRef<
  KioskRuleGraphHandle,
  {
    nodes: RuleNode[];
    edges: RuleEdge[];
    selectedId: string | null;
    fitKey?: string;
    onSelect: (id: string | null) => void;
    onMove?: (id: string, x: number, y: number) => void;
    onScaleChange?: (scale: number) => void;
  }
>(function KioskRuleGraph(
  { nodes, edges, selectedId, fitKey, onSelect, onMove, onScaleChange },
  ref,
) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);
  const panRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(
    null,
  );
  const [cam, setCam] = useState({ x: 28, y: 72 });
  const [scale, setScale] = useState(1);
  const camRef = useRef(cam);
  const scaleRef = useRef(scale);
  camRef.current = cam;
  scaleRef.current = scale;
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  const zoomTo = (nextScale: number, originClientX: number, originClientY: number) => {
    const el = viewportRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const clamped = clampZoom(nextScale);
    const current = scaleRef.current;
    const { x, y } = camRef.current;
    const ox = originClientX - rect.left;
    const oy = originClientY - rect.top;
    const worldX = (ox - x) / current;
    const worldY = (oy - y) / current;
    setScale(clamped);
    onScaleChange?.(clamped);
    setCam({
      x: ox - worldX * clamped,
      y: oy - worldY * clamped,
    });
  };

  const zoomBy = (factor: number) => {
    const el = viewportRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    zoomTo(scaleRef.current * factor, rect.left + rect.width / 2, rect.top + rect.height / 2);
  };

  const fitView = () => {
    const el = viewportRef.current;
    const list = nodesRef.current;
    if (!el || list.length === 0) return;
    const minX = Math.min(...list.map((node) => node.x));
    const minY = Math.min(...list.map((node) => node.y));
    const maxX = Math.max(...list.map((node) => node.x + NODE_W));
    const maxY = Math.max(...list.map((node) => node.y + NODE_H));
    const pad = 56;
    const next = clampZoom(
      Math.min((el.clientWidth - pad * 2) / (maxX - minX), (el.clientHeight - pad * 2) / (maxY - minY), 1),
    );
    setScale(next);
    onScaleChange?.(next);
    setCam({
      x: pad - minX * next,
      y: (el.clientHeight - (maxY - minY) * next) / 2 - minY * next,
    });
  };

  useImperativeHandle(ref, () => ({
    zoomIn: () => zoomBy(ZOOM_STEP),
    zoomOut: () => zoomBy(1 / ZOOM_STEP),
    fitView,
    getScale: () => scaleRef.current,
  }));

  const bounds = useMemo(() => {
    if (nodes.length === 0) return { w: 800, h: 400 };
    return {
      w: Math.max(800, ...nodes.map((node) => node.x + NODE_W + 80)),
      h: Math.max(360, ...nodes.map((node) => node.y + NODE_H + 80)),
    };
  }, [nodes]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => fitView());
    return () => window.cancelAnimationFrame(frame);
  }, [fitKey]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = event.deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP;
      zoomTo(scaleRef.current * factor, event.clientX, event.clientY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const byId = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  const paths = useMemo(() => {
    return edges.flatMap((edge) => {
      const from = byId.get(edge.from);
      const to = byId.get(edge.to);
      if (!from || !to) return [];
      const pts = anchors(from, to);
      return [{ ...edge, d: curve(pts), labelX: (pts.x1 + pts.x2) / 2, labelY: (pts.y1 + pts.y2) / 2 - 8 }];
    });
  }, [byId, edges]);

  return (
    <div
      ref={viewportRef}
      className="absolute inset-0 cursor-grab overflow-hidden bg-[#f6f7f9] active:cursor-grabbing"
      onPointerDown={(event) => {
        if (event.target !== event.currentTarget) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        panRef.current = {
          startX: event.clientX,
          startY: event.clientY,
          origX: cam.x,
          origY: cam.y,
        };
        onSelect(null);
      }}
      onPointerMove={(event) => {
        const pan = panRef.current;
        if (!pan) return;
        setCam({
          x: pan.origX + (event.clientX - pan.startX),
          y: pan.origY + (event.clientY - pan.startY),
        });
      }}
      onPointerUp={() => {
        panRef.current = null;
      }}
    >
      <div
        className="pointer-events-none absolute top-0 left-0 will-change-transform"
        style={{
          width: bounds.w,
          height: bounds.h,
          transform: `translate(${cam.x}px, ${cam.y}px) scale(${scale})`,
          transformOrigin: "0 0",
        }}
      >
        <svg
          className="pointer-events-none absolute inset-0"
          width={bounds.w}
          height={bounds.h}
          aria-hidden="true"
        >
          {paths.map((path) => (
            <g key={`${path.from}-${path.to}-${path.label ?? ""}`}>
              <path d={path.d} fill="none" stroke="#d0d5dd" strokeWidth="1.75" />
              {path.label ? (
                <text
                  x={path.labelX}
                  y={path.labelY}
                  textAnchor="middle"
                  className="fill-slate-400 text-[10px] font-medium"
                >
                  {path.label}
                </text>
              ) : null}
            </g>
          ))}
        </svg>

        {nodes.map((node) => {
          const selected = node.id === selectedId;
          return (
            <div
              key={node.id}
              role="button"
              tabIndex={0}
              onClick={(event) => {
                event.stopPropagation();
                if (dragRef.current?.moved) return;
                onSelect(node.id);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(node.id);
                }
              }}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                event.stopPropagation();
                event.currentTarget.setPointerCapture(event.pointerId);
                dragRef.current = {
                  id: node.id,
                  startX: event.clientX,
                  startY: event.clientY,
                  origX: node.x,
                  origY: node.y,
                  moved: false,
                };
                onSelect(node.id);
              }}
              onPointerMove={(event) => {
                const drag = dragRef.current;
                if (!drag || drag.id !== node.id || !onMove) return;
                const dx = event.clientX - drag.startX;
                const dy = event.clientY - drag.startY;
                if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
                if (!drag.moved) return;
                const zoom = scaleRef.current;
                onMove(
                  node.id,
                  Math.max(8, Math.round(drag.origX + dx / zoom)),
                  Math.max(8, Math.round(drag.origY + dy / zoom)),
                );
              }}
              onPointerUp={() => {
                dragRef.current = null;
              }}
              style={{ left: node.x, top: node.y, width: NODE_W, height: NODE_H }}
              className={cn(
                "pointer-events-auto absolute flex items-center gap-2.5 rounded-2xl px-3 text-left select-none",
                nodeChrome(node.kind, selected),
              )}
            >
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-xl",
                  iconWrap(node.kind),
                )}
              >
                <KindIcon kind={node.kind} />
              </span>
              <span className="min-w-0">
                <span
                  className={cn(
                    "block truncate text-[10px] font-medium",
                    node.kind === "end" ? "text-slate-400" : "text-slate-400",
                  )}
                >
                  {node.tool ?? (node.kind === "addon" ? "Add-on" : node.kind === "tool" ? "Tool" : "Step")}
                </span>
                <span className="block truncate text-sm font-semibold leading-tight">{node.label}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
});
