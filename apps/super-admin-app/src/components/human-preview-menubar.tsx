"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { deferEffectRun } from "@/lib/defer-effect-run";

/** Matches Human demo tabs: display / input / options / models (+ start video). */
export type HumanMenuTab = "display" | "input" | "options" | "models" | null;

export type HumanBackend = "webgl" | "wasm" | "cpu" | "humangl";

export type HumanDisplayOptions = {
  results: boolean;
  perfMonitor: boolean;
  buffered: boolean;
  crop: boolean;
  facingUser: boolean;
  useDepth: boolean;
  useCurves: boolean;
  drawLabels: boolean;
  drawPoints: boolean;
  drawBoxes: boolean;
  drawPolygons: boolean;
  fillPolygons: boolean;
  drawGestures: boolean;
  drawGaze: boolean;
  interpolated: boolean;
};

/** Image filters — Human demo "input" menu (`userConfig.filter`). */
export type HumanInputOptions = {
  enabled: boolean;
  equalization: boolean;
  flip: boolean;
  width: number;
  height: number;
  brightness: number;
  contrast: number;
  sharpness: number;
  blur: number;
  saturation: number;
  hue: number;
  pixelate: number;
  negative: boolean;
  sepia: boolean;
  vintage: boolean;
  kodachrome: boolean;
  technicolor: boolean;
  polaroid: boolean;
};

/** Process / options menu — backend + detector params. */
export type HumanProcessOptions = {
  backend: HumanBackend;
  async: boolean;
  maxDetected: number;
  skipFrames: number;
  minConfidence: number;
  iouThreshold: number;
  rotation: boolean;
};

export type HumanModelOptions = {
  face: boolean;
  mesh: boolean;
  iris: boolean;
  description: boolean;
  emotion: boolean;
  body: boolean;
  hand: boolean;
  gesture: boolean;
  object: boolean;
};

export const DEFAULT_HUMAN_DISPLAY: HumanDisplayOptions = {
  results: false,
  perfMonitor: true,
  buffered: true,
  crop: false,
  facingUser: true,
  useDepth: true,
  useCurves: false,
  drawLabels: true,
  drawPoints: false,
  drawBoxes: true,
  drawPolygons: true,
  fillPolygons: false,
  drawGestures: true,
  drawGaze: true,
  interpolated: true,
};

export const DEFAULT_HUMAN_INPUT: HumanInputOptions = {
  enabled: true,
  equalization: false,
  flip: false,
  width: 0,
  height: 0,
  brightness: 0,
  contrast: 0,
  sharpness: 0,
  blur: 0,
  saturation: 0,
  hue: 0,
  pixelate: 0,
  negative: false,
  sepia: false,
  vintage: false,
  kodachrome: false,
  technicolor: false,
  polaroid: false,
};

export const DEFAULT_HUMAN_PROCESS: HumanProcessOptions = {
  backend: "webgl",
  async: true,
  maxDetected: 10,
  skipFrames: 0,
  minConfidence: 0.2,
  iouThreshold: 0.4,
  rotation: false,
};

export const DEFAULT_HUMAN_MODELS: HumanModelOptions = {
  face: true,
  mesh: true,
  iris: false,
  description: false,
  emotion: true,
  body: false,
  hand: true,
  gesture: true,
  object: false,
};

type ToggleProps = {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (next: boolean) => void;
};

function Toggle({ label, hint, checked, onChange }: ToggleProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm text-slate-100 hover:bg-slate-700/80">
          <span>{label}</span>
          <input
            type="checkbox"
            className="size-4 accent-orange-500"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
          />
        </label>
      </TooltipTrigger>
      <TooltipContent
        side="left"
        className="z-[90] max-w-64 border border-slate-600 bg-slate-950 px-3 py-2 text-xs leading-snug text-slate-100 shadow-xl"
      >
        {hint}
      </TooltipContent>
    </Tooltip>
  );
}

type RangeProps = {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (next: number) => void;
};

function RangeControl({ label, hint, value, min, max, step, onChange }: RangeProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <label className="flex flex-col gap-1 rounded-md px-2 py-1.5 text-sm text-slate-100 hover:bg-slate-700/80">
          <div className="flex items-center justify-between gap-2">
            <span>{label}</span>
            <span className="tabular-nums text-slate-400">{value}</span>
          </div>
          <input
            type="range"
            className="w-full accent-orange-500"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
          />
        </label>
      </TooltipTrigger>
      <TooltipContent
        side="left"
        className="z-[90] max-w-64 border border-slate-600 bg-slate-950 px-3 py-2 text-xs leading-snug text-slate-100 shadow-xl"
      >
        {hint}
      </TooltipContent>
    </Tooltip>
  );
}

type SelectProps = {
  label: string;
  hint: string;
  value: string;
  options: string[];
  onChange: (next: string) => void;
};

function SelectControl({ label, hint, value, options, onChange }: SelectProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <label className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm text-slate-100 hover:bg-slate-700/80">
          <span>{label}</span>
          <select
            className="rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-slate-100"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          >
            {options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
      </TooltipTrigger>
      <TooltipContent
        side="left"
        className="z-[90] max-w-64 border border-slate-600 bg-slate-950 px-3 py-2 text-xs leading-snug text-slate-100 shadow-xl"
      >
        {hint}
      </TooltipContent>
    </Tooltip>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-2 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
      {children}
    </p>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="px-2 pb-1 pt-2 text-[11px] leading-snug text-slate-400">{children}</p>;
}

function MenuDropdown({
  open,
  align = "left",
  anchorRef,
  children,
}: {
  open: boolean;
  align?: "left" | "right";
  anchorRef: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      deferEffectRun(() => setCoords(null));
      return;
    }
    const update = () => {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const width = Math.min(288, window.innerWidth - 16);
      let left = align === "right" ? rect.right - width : rect.left;
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
      setCoords({ top: rect.bottom + 4, left });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, align, anchorRef]);

  if (!open || !coords || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="menu"
      data-human-menu-dropdown="1"
      className="fixed z-[80] w-[min(18rem,calc(100vw-2rem))] max-h-[min(60vh,28rem)] overflow-y-auto rounded-xl border border-slate-600 bg-slate-800 p-1.5 text-white shadow-2xl"
      style={{ top: coords.top, left: coords.left }}
    >
      {children}
    </div>,
    document.body,
  );
}

type HumanPreviewMenubarProps = {
  menu: HumanMenuTab;
  onMenuChange: (menu: HumanMenuTab) => void;
  display: HumanDisplayOptions;
  onDisplayChange: (next: HumanDisplayOptions) => void;
  models: HumanModelOptions;
  onModelsChange: (next: HumanModelOptions) => void;
  input: HumanInputOptions;
  onInputChange: (next: HumanInputOptions) => void;
  process: HumanProcessOptions;
  onProcessChange: (next: HumanProcessOptions) => void;
  paused: boolean;
  onPausedChange: (paused: boolean) => void;
  running: boolean;
  fps: number;
  resultsJson: string | null;
};

export function HumanPreviewMenubar({
  menu,
  onMenuChange,
  display,
  onDisplayChange,
  models,
  onModelsChange,
  input,
  onInputChange,
  process,
  onProcessChange,
  paused,
  onPausedChange,
  running,
  fps,
  resultsJson,
}: HumanPreviewMenubarProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const displayBtnRef = useRef<HTMLButtonElement | null>(null);
  const inputBtnRef = useRef<HTMLButtonElement | null>(null);
  const optionsBtnRef = useRef<HTMLButtonElement | null>(null);
  const modelsBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!menu) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (rootRef.current?.contains(target)) return;
      if (target.closest('[data-human-menu-dropdown="1"]')) return;
      if (target.closest("[data-slot='tooltip-content'], [data-radix-tooltip-content], [role='tooltip']")) {
        return;
      }
      onMenuChange(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onMenuChange(null);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu, onMenuChange]);

  const tabButtonClass = (active: boolean) =>
    cn(
      "w-full rounded-lg px-2 py-2 text-center text-xs font-medium tracking-wide uppercase transition",
      active ? "bg-slate-600 text-white" : "text-slate-200 hover:bg-slate-700",
    );

  return (
    <TooltipProvider delayDuration={250}>
      <div className="space-y-3">
        <div
          ref={rootRef}
          className="relative z-30 flex flex-wrap items-stretch justify-between gap-1 rounded-xl bg-slate-800 px-1 py-1 text-white"
        >
          <div className="relative min-w-[4rem] flex-1">
            <button
              ref={displayBtnRef}
              type="button"
              aria-expanded={menu === "display"}
              aria-haspopup="menu"
              onClick={() => onMenuChange(menu === "display" ? null : "display")}
              className={tabButtonClass(menu === "display")}
            >
              display
            </button>
            <MenuDropdown open={menu === "display"} anchorRef={displayBtnRef}>
              <SectionLabel>UI</SectionLabel>
              <Toggle
                label="results tree"
                hint="Shows a JSON dump of the latest Human detection result (faces, hands, gestures, scores)."
                checked={display.results}
                onChange={(v) => onDisplayChange({ ...display, results: v })}
              />
              <Toggle
                label="perf monitor"
                hint="Shows live FPS in the options menu and in the status line so you can judge performance."
                checked={display.perfMonitor}
                onChange={(v) => onDisplayChange({ ...display, perfMonitor: v })}
              />
              <Toggle
                label="buffer output"
                hint="Slightly spaces draw refreshes for smoother playback when detection is slower than the display rate."
                checked={display.buffered}
                onChange={(v) => onDisplayChange({ ...display, buffered: v })}
              />
              <Toggle
                label="crop & scale"
                hint="Asks the webcam to crop/scale the frame (restarts camera). Useful on phones or odd aspect ratios."
                checked={display.crop}
                onChange={(v) => onDisplayChange({ ...display, crop: v })}
              />
              <Toggle
                label="camera facing"
                hint="On = front (selfie) camera. Off = back / environment camera. Restarts the webcam."
                checked={display.facingUser}
                onChange={(v) => onDisplayChange({ ...display, facingUser: v })}
              />
              <Toggle
                label="smooth (interpolate)"
                hint="Interpolates landmarks between detect frames so overlays move more smoothly instead of jumping."
                checked={display.interpolated}
                onChange={(v) => onDisplayChange({ ...display, interpolated: v })}
              />
              <SectionLabel>Draw</SectionLabel>
              <Toggle
                label="use depth"
                hint="Tints mesh / skeleton by estimated depth so closer points look different from farther ones."
                checked={display.useDepth}
                onChange={(v) => onDisplayChange({ ...display, useDepth: v })}
              />
              <Toggle
                label="use curves"
                hint="Draws curved connections between landmarks instead of straight lines."
                checked={display.useCurves}
                onChange={(v) => onDisplayChange({ ...display, useCurves: v })}
              />
              <Toggle
                label="print labels"
                hint="Writes text labels on detections (age/gender/emotion, gesture names, etc.)."
                checked={display.drawLabels}
                onChange={(v) => onDisplayChange({ ...display, drawLabels: v })}
              />
              <Toggle
                label="draw points"
                hint="Draws individual landmark dots (face mesh / hand / body keypoints)."
                checked={display.drawPoints}
                onChange={(v) => onDisplayChange({ ...display, drawPoints: v })}
              />
              <Toggle
                label="draw boxes"
                hint="Draws bounding boxes around detected faces, hands, bodies, or objects."
                checked={display.drawBoxes}
                onChange={(v) => onDisplayChange({ ...display, drawBoxes: v })}
              />
              <Toggle
                label="draw polygons"
                hint="Draws mesh / contour outlines (face mesh wireframe, hand skeleton, body skeleton)."
                checked={display.drawPolygons}
                onChange={(v) => onDisplayChange({ ...display, drawPolygons: v })}
              />
              <Toggle
                label="fill polygons"
                hint="Fills mesh polygons with color instead of only stroking outlines."
                checked={display.fillPolygons}
                onChange={(v) => onDisplayChange({ ...display, fillPolygons: v })}
              />
              <Toggle
                label="draw gestures"
                hint="Overlays recognized gesture names (wave, thumbs up, etc.) when the gesture model is on."
                checked={display.drawGestures}
                onChange={(v) => onDisplayChange({ ...display, drawGestures: v })}
              />
              <Toggle
                label="draw gaze"
                hint="Draws eye-gaze direction lines when iris / face models provide gaze data."
                checked={display.drawGaze}
                onChange={(v) => onDisplayChange({ ...display, drawGaze: v })}
              />
            </MenuDropdown>
          </div>

          <div className="relative min-w-[4rem] flex-1">
            <button
              ref={inputBtnRef}
              type="button"
              aria-expanded={menu === "input"}
              aria-haspopup="menu"
              onClick={() => onMenuChange(menu === "input" ? null : "input")}
              className={tabButtonClass(menu === "input")}
            >
              input
            </button>
            <MenuDropdown open={menu === "input"} anchorRef={inputBtnRef}>
              <SectionLabel>Filter</SectionLabel>
              <Toggle
                label="enabled"
                hint="Turns Human’s image filter pipeline on or off. Other filter controls only apply when this is on."
                checked={input.enabled}
                onChange={(v) => onInputChange({ ...input, enabled: v })}
              />
              <Toggle
                label="histogram equalization"
                hint="Boosts contrast by spreading pixel intensities — can help in dark or flat lighting."
                checked={input.equalization}
                onChange={(v) => onInputChange({ ...input, equalization: v })}
              />
              <Toggle
                label="flip (mirror)"
                hint="Mirrors the frame horizontally (selfie-style). Detection and overlays stay aligned."
                checked={input.flip}
                onChange={(v) => onInputChange({ ...input, flip: v })}
              />
              <RangeControl
                label="image width"
                hint="Downscale/upscale processed width in pixels. 0 = keep camera width (faster when smaller)."
                value={input.width}
                min={0}
                max={1920}
                step={10}
                onChange={(v) => onInputChange({ ...input, width: v })}
              />
              <RangeControl
                label="image height"
                hint="Downscale/upscale processed height in pixels. 0 = keep camera height."
                value={input.height}
                min={0}
                max={1080}
                step={10}
                onChange={(v) => onInputChange({ ...input, height: v })}
              />
              <SectionLabel>Adjust</SectionLabel>
              <RangeControl
                label="brightness"
                hint="Brightens or darkens the frame before detection (−1 to +1)."
                value={input.brightness}
                min={-1}
                max={1}
                step={0.05}
                onChange={(v) => onInputChange({ ...input, brightness: v })}
              />
              <RangeControl
                label="contrast"
                hint="Increases or decreases contrast before detection (−1 to +1)."
                value={input.contrast}
                min={-1}
                max={1}
                step={0.05}
                onChange={(v) => onInputChange({ ...input, contrast: v })}
              />
              <RangeControl
                label="sharpness"
                hint="Sharpens edges. Can help landmarks, but may add noise."
                value={input.sharpness}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) => onInputChange({ ...input, sharpness: v })}
              />
              <RangeControl
                label="blur"
                hint="Softens the image. Higher blur reduces detail and can hurt accuracy."
                value={input.blur}
                min={0}
                max={20}
                step={1}
                onChange={(v) => onInputChange({ ...input, blur: v })}
              />
              <RangeControl
                label="saturation"
                hint="Color intensity: lower = more gray, higher = more vivid (−1 to +1)."
                value={input.saturation}
                min={-1}
                max={1}
                step={0.05}
                onChange={(v) => onInputChange({ ...input, saturation: v })}
              />
              <RangeControl
                label="hue"
                hint="Shifts colors around the color wheel (0–360°). Mostly for visual testing."
                value={input.hue}
                min={0}
                max={360}
                step={5}
                onChange={(v) => onInputChange({ ...input, hue: v })}
              />
              <RangeControl
                label="pixelate"
                hint="Blocky mosaic effect. Higher values hide detail (privacy-style / stress test)."
                value={input.pixelate}
                min={0}
                max={32}
                step={1}
                onChange={(v) => onInputChange({ ...input, pixelate: v })}
              />
              <SectionLabel>Looks</SectionLabel>
              <Toggle
                label="negative"
                hint="Inverts colors (photo-negative). Useful to stress-test detection under odd lighting."
                checked={input.negative}
                onChange={(v) => onInputChange({ ...input, negative: v })}
              />
              <Toggle
                label="sepia"
                hint="Applies a warm sepia tone filter before detection."
                checked={input.sepia}
                onChange={(v) => onInputChange({ ...input, sepia: v })}
              />
              <Toggle
                label="vintage"
                hint="Applies a faded vintage film look."
                checked={input.vintage}
                onChange={(v) => onInputChange({ ...input, vintage: v })}
              />
              <Toggle
                label="kodachrome"
                hint="Applies a Kodachrome-style color filter."
                checked={input.kodachrome}
                onChange={(v) => onInputChange({ ...input, kodachrome: v })}
              />
              <Toggle
                label="technicolor"
                hint="Applies a vivid Technicolor-style filter."
                checked={input.technicolor}
                onChange={(v) => onInputChange({ ...input, technicolor: v })}
              />
              <Toggle
                label="polaroid"
                hint="Applies a Polaroid-style filter."
                checked={input.polaroid}
                onChange={(v) => onInputChange({ ...input, polaroid: v })}
              />
              <Hint>
                Width/height 0 keeps camera size. Filters apply live via Human{" "}
                <code className="text-[10px]">filter</code>.
              </Hint>
            </MenuDropdown>
          </div>

          <div className="relative min-w-[4rem] flex-1">
            <button
              ref={optionsBtnRef}
              type="button"
              aria-expanded={menu === "options"}
              aria-haspopup="menu"
              onClick={() => onMenuChange(menu === "options" ? null : "options")}
              className={tabButtonClass(menu === "options")}
            >
              options
            </button>
            <MenuDropdown open={menu === "options"} anchorRef={optionsBtnRef}>
              <SectionLabel>Runtime</SectionLabel>
              <SelectControl
                label="backend"
                hint="TF.js execution backend. Prefer webgl on GPU machines; try wasm if WebGL is slow or broken. Reloads Human."
                value={process.backend}
                options={["webgl", "wasm", "cpu", "humangl"]}
                onChange={(v) =>
                  onProcessChange({ ...process, backend: v as HumanBackend })
                }
              />
              <Toggle
                label="async operations"
                hint="Runs TensorFlow ops asynchronously. Usually faster; turn off only if you see race / stability issues."
                checked={process.async}
                onChange={(v) => onProcessChange({ ...process, async: v })}
              />
              {display.perfMonitor ? (
                <div className="mx-1 my-1 rounded-md bg-slate-900/70 px-2 py-2 text-sm">
                  <div className="flex items-center justify-between text-slate-100">
                    <span className="font-medium">FPS</span>
                    <span className="tabular-nums text-orange-400">{fps.toFixed(1)}</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded bg-slate-700">
                    <div
                      className="h-full rounded bg-orange-500 transition-all duration-200"
                      style={{ width: `${Math.min(100, (fps / 30) * 100)}%` }}
                    />
                  </div>
                </div>
              ) : null}
              <SectionLabel>Model parameters</SectionLabel>
              <RangeControl
                label="max objects"
                hint="Maximum faces / hands / bodies to detect per frame. Lower = faster."
                value={process.maxDetected}
                min={1}
                max={50}
                step={1}
                onChange={(v) => onProcessChange({ ...process, maxDetected: v })}
              />
              <RangeControl
                label="skip frames"
                hint="Reuse previous detections for N frames instead of re-running every frame. Higher = faster, less responsive."
                value={process.skipFrames}
                min={0}
                max={50}
                step={1}
                onChange={(v) => onProcessChange({ ...process, skipFrames: v })}
              />
              <RangeControl
                label="min confidence"
                hint="Ignore detections below this score (0–1). Higher = fewer false positives, may miss weak detections."
                value={process.minConfidence}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) => onProcessChange({ ...process, minConfidence: v })}
              />
              <RangeControl
                label="overlap (IoU)"
                hint="Non-max suppression overlap threshold. Lower removes more overlapping boxes; higher keeps more duplicates."
                value={process.iouThreshold}
                min={0.1}
                max={1}
                step={0.05}
                onChange={(v) => onProcessChange({ ...process, iouThreshold: v })}
              />
              <Toggle
                label="rotation detection"
                hint="Estimates face/hand rotation. More accurate for tilted poses, slightly more expensive."
                checked={process.rotation}
                onChange={(v) => onProcessChange({ ...process, rotation: v })}
              />
              <Hint>Backend changes reload Human. Detector params apply next frame.</Hint>
            </MenuDropdown>
          </div>

          <div className="relative min-w-[4rem] flex-1">
            <button
              ref={modelsBtnRef}
              type="button"
              aria-expanded={menu === "models"}
              aria-haspopup="menu"
              onClick={() => onMenuChange(menu === "models" ? null : "models")}
              className={tabButtonClass(menu === "models")}
            >
              models
            </button>
            <MenuDropdown open={menu === "models"} align="right" anchorRef={modelsBtnRef}>
              <SectionLabel>Face</SectionLabel>
              <Toggle
                label="face detect"
                hint="Finds faces and bounding boxes. Required for mesh, iris, emotion, and description."
                checked={models.face}
                onChange={(v) => onModelsChange({ ...models, face: v })}
              />
              <Toggle
                label="face mesh"
                hint="468-point 3D face landmarks (wireframe). Needed for detailed face overlays."
                checked={models.mesh}
                onChange={(v) => onModelsChange({ ...models, mesh: v })}
              />
              <Toggle
                label="face iris"
                hint="Tracks irises for gaze direction. Heavier; enable when testing eye contact / gaze."
                checked={models.iris}
                onChange={(v) => onModelsChange({ ...models, iris: v })}
              />
              <Toggle
                label="face description"
                hint="Computes a face embedding / descriptor (identity-style features). Relatively heavy."
                checked={models.description}
                onChange={(v) => onModelsChange({ ...models, description: v })}
              />
              <Toggle
                label="face emotion"
                hint="Predicts emotion labels (happy, sad, etc.) shown when print labels is on."
                checked={models.emotion}
                onChange={(v) => onModelsChange({ ...models, emotion: v })}
              />
              <SectionLabel>Body & hand</SectionLabel>
              <Toggle
                label="body pose"
                hint="Full-body skeleton (MoveNet-style). Useful for presence / pose testing; costs FPS."
                checked={models.body}
                onChange={(v) => onModelsChange({ ...models, body: v })}
              />
              <Toggle
                label="hand pose"
                hint="Hand + finger landmarks. Needed for most gesture recognition."
                checked={models.hand}
                onChange={(v) => onModelsChange({ ...models, hand: v })}
              />
              <SectionLabel>Other</SectionLabel>
              <Toggle
                label="gestures"
                hint="Classifies gestures from face/hand poses (wave, point, thumbs up, etc.)."
                checked={models.gesture}
                onChange={(v) => onModelsChange({ ...models, gesture: v })}
              />
              <Toggle
                label="object detection"
                hint="General object detector (not person-only). Heavy; usually leave off for kiosk vision tests."
                checked={models.object}
                onChange={(v) => onModelsChange({ ...models, object: v })}
              />
              <Hint>Model toggles reload Human. Enable only what you need for better FPS.</Hint>
            </MenuDropdown>
          </div>

          <button
            type="button"
            disabled={!running}
            onClick={() => onPausedChange(!paused)}
            className={cn(
              "min-w-[5.5rem] flex-1 rounded-lg px-2 py-2 text-center text-xs font-medium tracking-wide uppercase transition",
              paused ? "bg-orange-500 text-white hover:bg-orange-600" : "text-slate-200 hover:bg-slate-700",
              !running && "cursor-not-allowed opacity-50",
            )}
          >
            {paused ? "start video" : "stop video"}
          </button>
        </div>

        {display.results && resultsJson ? (
          <pre className="max-h-48 overflow-auto rounded-xl border border-border bg-slate-950 p-3 text-[11px] leading-relaxed text-slate-200">
            {resultsJson}
          </pre>
        ) : null}
      </div>
    </TooltipProvider>
  );
}
