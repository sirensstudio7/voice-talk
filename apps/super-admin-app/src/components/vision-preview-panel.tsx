"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { FaceDetector, FilesetResolver } from "@mediapipe/tasks-vision";

import {
  DEFAULT_HUMAN_DISPLAY,
  DEFAULT_HUMAN_INPUT,
  DEFAULT_HUMAN_MODELS,
  DEFAULT_HUMAN_PROCESS,
  HumanPreviewMenubar,
  type HumanDisplayOptions,
  type HumanInputOptions,
  type HumanMenuTab,
  type HumanModelOptions,
  type HumanProcessOptions,
} from "@/components/human-preview-menubar";
import { Button } from "@/components/ui/button";
import type { VisionPreviewSource } from "@/components/vision-preview-types";
import { cn } from "@/lib/cn";
import { loadHumanFromCdn, type HumanInstance } from "@/lib/load-human-cdn";

export type { VisionPreviewSource };

const FACE_MODEL_PATH = "/models/blaze_face_short_range.tflite";
const WASM_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm";
const HUMAN_MODELS = "https://vladmandic.github.io/human-models/models/";

type VisionPreviewPanelProps = {
  source: VisionPreviewSource | null;
  onClose: () => void;
};

function cameraErrorMessage(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === "NotAllowedError") {
      return "Camera permission denied. Allow camera access for this site and try again.";
    }
    if (err.name === "NotFoundError") {
      return "No camera found on this device.";
    }
    if (err.name === "NotReadableError") {
      return "Camera is in use by another app or tab.";
    }
  }
  return err instanceof Error ? err.message : "Unable to start camera preview.";
}

export function VisionPreviewPanel({ source, onClose }: VisionPreviewPanelProps) {
  const open = Boolean(source);
  const [rendered, setRendered] = useState(false);
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState("Idle");
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [humanMenu, setHumanMenu] = useState<HumanMenuTab>(null);
  const [humanDisplay, setHumanDisplay] = useState<HumanDisplayOptions>(DEFAULT_HUMAN_DISPLAY);
  const [humanModels, setHumanModels] = useState<HumanModelOptions>(DEFAULT_HUMAN_MODELS);
  const [humanInput, setHumanInput] = useState<HumanInputOptions>(DEFAULT_HUMAN_INPUT);
  const [humanProcess, setHumanProcess] = useState<HumanProcessOptions>(DEFAULT_HUMAN_PROCESS);
  const [paused, setPaused] = useState(false);
  const [humanFps, setHumanFps] = useState(0);
  const [resultsJson, setResultsJson] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const bufferTimeoutRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);
  const faceDetectorRef = useRef<FaceDetector | null>(null);
  const humanRef = useRef<HumanInstance | null>(null);
  const timestampMsRef = useRef(0);
  const lastStatusAtRef = useRef(0);
  const humanFpsRef = useRef(0);
  const humanDisplayRef = useRef(humanDisplay);
  const humanInputRef = useRef(humanInput);
  const humanProcessRef = useRef(humanProcess);
  const humanModelsRef = useRef(humanModels);
  const pausedRef = useRef(paused);
  humanDisplayRef.current = humanDisplay;
  humanInputRef.current = humanInput;
  humanProcessRef.current = humanProcess;
  humanModelsRef.current = humanModels;
  pausedRef.current = paused;

  const humanModelsKey = JSON.stringify(humanModels);

  useEffect(() => {
    if (open) {
      setRendered(true);
      const frame = requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
      return () => cancelAnimationFrame(frame);
    }
    setVisible(false);
    const timer = window.setTimeout(() => setRendered(false), 300);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setFullscreen(false);
      setPaused(false);
      setHumanMenu(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (fullscreen) {
          setFullscreen(false);
          return;
        }
        onClose();
      }
      if (event.key === "f" || event.key === "F") {
        const tag = (event.target as HTMLElement | null)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        setFullscreen((current) => !current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, fullscreen]);

  const stopPreview = () => {
    cancelledRef.current = true;
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (bufferTimeoutRef.current != null) {
      window.clearTimeout(bufferTimeoutRef.current);
      bufferTimeoutRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    faceDetectorRef.current?.close();
    faceDetectorRef.current = null;
    humanRef.current = null;
    setRunning(false);
  };

  useEffect(() => {
    if (!source || source === "auto" || source === "python") {
      stopPreview();
      setError(null);
      setStatus(
        source === "python"
          ? "Python sidecar runs on the kiosk machine — not previewable here."
          : source === "auto"
            ? "Auto picks Python when connected, otherwise browser camera."
            : "Idle",
      );
      return;
    }

    cancelledRef.current = false;
    setError(null);
    setStatus("Starting camera…");
    setRunning(false);
    setHumanFps(0);
    setResultsJson(null);

    const start = async () => {
      try {
        const facingMode =
          source === "human" && !humanDisplay.facingUser ? "environment" : "user";
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode,
            width: { ideal: 1280 },
            height: { ideal: 720 },
            ...(source === "human" && humanDisplay.crop
              ? { resizeMode: "crop-and-scale" as const }
              : {}),
          },
        });
        if (cancelledRef.current) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;

        video.srcObject = stream;
        await video.play();
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
        setRunning(true);

        if (source === "browser") {
          setStatus("Loading MediaPipe face detector…");
          const vision = await FilesetResolver.forVisionTasks(WASM_CDN);
          if (cancelledRef.current) return;
          const detector = await FaceDetector.createFromOptions(vision, {
            baseOptions: { modelAssetPath: FACE_MODEL_PATH },
            runningMode: "VIDEO",
            minDetectionConfidence: 0.5,
          });
          if (cancelledRef.current) {
            detector.close();
            return;
          }
          faceDetectorRef.current = detector;
          setStatus("Browser preview running");

          const loop = () => {
            if (cancelledRef.current || !videoRef.current || !canvasRef.current) return;
            const v = videoRef.current;
            const c = canvasRef.current;
            const ctx = c.getContext("2d");
            const detectorNow = faceDetectorRef.current;
            if (!ctx || !detectorNow || v.readyState < 2) {
              rafRef.current = requestAnimationFrame(loop);
              return;
            }

            if (c.width !== v.videoWidth || c.height !== v.videoHeight) {
              c.width = v.videoWidth;
              c.height = v.videoHeight;
            }

            ctx.drawImage(v, 0, 0, c.width, c.height);
            timestampMsRef.current += 33;
            const result = detectorNow.detectForVideo(v, timestampMsRef.current);
            ctx.strokeStyle = "#f97316";
            ctx.lineWidth = 3;
            ctx.font = "14px sans-serif";
            ctx.fillStyle = "#f97316";

            for (const detection of result.detections) {
              const box = detection.boundingBox;
              if (!box) continue;
              ctx.strokeRect(box.originX, box.originY, box.width, box.height);
              const score = detection.categories[0]?.score;
              if (typeof score === "number") {
                ctx.fillText(`${Math.round(score * 100)}%`, box.originX + 4, box.originY + 16);
              }
            }

            const now = performance.now();
            if (now - lastStatusAtRef.current > 400) {
              lastStatusAtRef.current = now;
              setStatus(`Browser · ${result.detections.length} face(s)`);
            }
            rafRef.current = requestAnimationFrame(loop);
          };
          rafRef.current = requestAnimationFrame(loop);
          return;
        }

        // Human via CDN (avoids Next bundling human.node.js / tfjs-node).
        setStatus("Loading Human from CDN…");
        const HumanCtor = await loadHumanFromCdn();
        if (cancelledRef.current) return;
        const models = humanModelsRef.current;
        const process = humanProcessRef.current;
        const filter = humanInputRef.current;
        const human = new HumanCtor({
          modelBasePath: HUMAN_MODELS,
          backend: process.backend,
          async: process.async,
          warmup: "none",
          filter: {
            enabled: filter.enabled,
            equalization: filter.equalization,
            flip: filter.flip,
            width: filter.width,
            height: filter.height,
            brightness: filter.brightness,
            contrast: filter.contrast,
            sharpness: filter.sharpness,
            blur: filter.blur,
            saturation: filter.saturation,
            hue: filter.hue,
            pixelate: filter.pixelate,
            negative: filter.negative,
            sepia: filter.sepia,
            vintage: filter.vintage,
            kodachrome: filter.kodachrome,
            technicolor: filter.technicolor,
            polaroid: filter.polaroid,
          },
          face: {
            enabled: models.face,
            detector: {
              rotation: process.rotation,
              maxDetected: process.maxDetected,
              skipFrames: process.skipFrames,
              minConfidence: process.minConfidence,
              iouThreshold: process.iouThreshold,
            },
            mesh: { enabled: models.face && models.mesh },
            iris: { enabled: models.face && models.iris },
            description: { enabled: models.face && models.description },
            emotion: {
              enabled: models.face && models.emotion,
              skipFrames: process.skipFrames,
              minConfidence: process.minConfidence,
            },
          },
          body: { enabled: models.body, maxDetected: process.maxDetected },
          hand: {
            enabled: models.hand,
            maxDetected: process.maxDetected,
            skipFrames: process.skipFrames,
            minConfidence: process.minConfidence,
            iouThreshold: process.iouThreshold,
            rotation: process.rotation,
          },
          object: { enabled: models.object },
          gesture: { enabled: models.gesture },
          segmentation: { enabled: false },
        });
        await human.load();
        await human.warmup();
        if (cancelledRef.current) return;
        humanRef.current = human;
        setPaused(false);
        setStatus("Human preview running");

        const loop = async () => {
          if (cancelledRef.current || !videoRef.current || !canvasRef.current || !humanRef.current) {
            return;
          }
          const v = videoRef.current;
          const c = canvasRef.current;
          const h = humanRef.current;

          if (pausedRef.current) {
            rafRef.current = requestAnimationFrame(() => {
              void loop();
            });
            return;
          }

          if (v.readyState < 2) {
            rafRef.current = requestAnimationFrame(() => {
              void loop();
            });
            return;
          }

          if (c.width !== v.videoWidth || c.height !== v.videoHeight) {
            c.width = v.videoWidth;
            c.height = v.videoHeight;
          }

          const display = humanDisplayRef.current;
          const liveFilter = humanInputRef.current;
          const liveProcess = humanProcessRef.current;
          const liveModels = humanModelsRef.current;

          const detectStarted = performance.now();
          await h.detect(v, {
            async: liveProcess.async,
            filter: {
              enabled: liveFilter.enabled,
              equalization: liveFilter.equalization,
              flip: liveFilter.flip,
              width: liveFilter.width,
              height: liveFilter.height,
              brightness: liveFilter.brightness,
              contrast: liveFilter.contrast,
              sharpness: liveFilter.sharpness,
              blur: liveFilter.blur,
              saturation: liveFilter.saturation,
              hue: liveFilter.hue,
              pixelate: liveFilter.pixelate,
              negative: liveFilter.negative,
              sepia: liveFilter.sepia,
              vintage: liveFilter.vintage,
              kodachrome: liveFilter.kodachrome,
              technicolor: liveFilter.technicolor,
              polaroid: liveFilter.polaroid,
            },
            face: {
              enabled: liveModels.face,
              detector: {
                rotation: liveProcess.rotation,
                maxDetected: liveProcess.maxDetected,
                skipFrames: liveProcess.skipFrames,
                minConfidence: liveProcess.minConfidence,
                iouThreshold: liveProcess.iouThreshold,
              },
              mesh: { enabled: liveModels.face && liveModels.mesh },
              iris: { enabled: liveModels.face && liveModels.iris },
              description: { enabled: liveModels.face && liveModels.description },
              emotion: {
                enabled: liveModels.face && liveModels.emotion,
                skipFrames: liveProcess.skipFrames,
                minConfidence: liveProcess.minConfidence,
              },
            },
            body: { enabled: liveModels.body, maxDetected: liveProcess.maxDetected },
            hand: {
              enabled: liveModels.hand,
              maxDetected: liveProcess.maxDetected,
              skipFrames: liveProcess.skipFrames,
              minConfidence: liveProcess.minConfidence,
              iouThreshold: liveProcess.iouThreshold,
              rotation: liveProcess.rotation,
            },
            object: { enabled: liveModels.object },
            gesture: { enabled: liveModels.gesture },
          });
          const detectMs = performance.now() - detectStarted;
          if (detectMs > 0) {
            const instantFps = 1000 / detectMs;
            humanFpsRef.current =
              humanFpsRef.current === 0
                ? instantFps
                : humanFpsRef.current * 0.7 + instantFps * 0.3;
          }

          const interpolated = display.interpolated
            ? h.next(h.result)
            : (h.result as ReturnType<HumanInstance["next"]>);
          if (h.draw.options) {
            Object.assign(h.draw.options, {
              bufferedOutput: display.buffered,
              drawBoxes: display.drawBoxes,
              drawLabels: display.drawLabels,
              drawGestures: display.drawGestures,
              drawPolygons: display.drawPolygons,
              drawPoints: display.drawPoints,
              drawGaze: display.drawGaze,
              fillPolygons: display.fillPolygons,
              useCurves: display.useCurves,
              useDepth: display.useDepth,
            });
          }
          const ctx = c.getContext("2d");
          if (ctx) {
            ctx.drawImage(v, 0, 0, c.width, c.height);
            await h.draw.all(c, interpolated);
          }

          const now = performance.now();
          if (now - lastStatusAtRef.current > 400) {
            lastStatusAtRef.current = now;
            const fps = humanFpsRef.current;
            setHumanFps(fps);
            const faces = interpolated.face?.length ?? 0;
            const hands = interpolated.hand?.length ?? 0;
            const gestures = (interpolated.gesture ?? [])
              .map((g) => g.gesture)
              .filter(Boolean)
              .slice(0, 3)
              .join(", ");
            const fpsPart = display.perfMonitor ? ` · ${fps.toFixed(0)} fps` : "";
            setStatus(
              `Human · ${faces} face(s) · ${hands} hand(s)${gestures ? ` · ${gestures}` : ""}${fpsPart}`,
            );
            if (display.results) {
              try {
                setResultsJson(JSON.stringify(interpolated, null, 2));
              } catch {
                setResultsJson(String(interpolated));
              }
            } else {
              setResultsJson(null);
            }
          }

          if (display.buffered) {
            bufferTimeoutRef.current = window.setTimeout(() => {
              bufferTimeoutRef.current = null;
              rafRef.current = requestAnimationFrame(() => {
                void loop();
              });
            }, 25);
          } else {
            rafRef.current = requestAnimationFrame(() => {
              void loop();
            });
          }
        };
        rafRef.current = requestAnimationFrame(() => {
          void loop();
        });
      } catch (err) {
        if (!cancelledRef.current) {
          setError(cameraErrorMessage(err));
          setStatus("Failed");
          stopPreview();
        }
      }
    };

    void start();
    return () => {
      stopPreview();
    };
    // Restart on model / backend / camera facing / crop; filters & draw options apply live.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    source,
    humanModelsKey,
    humanProcess.backend,
    humanDisplay.facingUser,
    humanDisplay.crop,
  ]);

  if (!rendered || !source) return null;

  const title =
    source === "browser"
      ? "Browser camera preview"
      : source === "human"
        ? "Human preview"
        : source === "python"
          ? "Python sidecar"
          : "Auto";

  const description =
    source === "browser"
      ? "MediaPipe face detection on this machine’s webcam (same class as merchant Browser source)."
      : source === "human"
        ? "Live Human.js face & hand overlay — like the public Human demo, on your webcam."
        : source === "python"
          ? "Requires a local vision process on the kiosk."
          : "Strategy selector, not a single detector.";

  const isLive = source === "browser" || source === "human";

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close preview"
        className={cn(
          "absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] transition-opacity duration-300",
          visible ? "opacity-100" : "opacity-0",
        )}
        onClick={onClose}
      />
      <aside
        className={cn(
          "absolute flex flex-col border-border bg-background shadow-2xl transition-all duration-300 ease-out",
          fullscreen
            ? "inset-0 z-10 border-0"
            : "inset-y-0 right-0 w-full max-w-2xl border-l",
          visible ? "translate-x-0 opacity-100" : "translate-x-full opacity-0",
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
            {!fullscreen ? (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setFullscreen((current) => !current)}
              aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              title={fullscreen ? "Exit fullscreen (Esc)" : "Fullscreen (F)"}
            >
              {fullscreen ? (
                <ArrowsPointingInIcon className="size-5" />
              ) : (
                <ArrowsPointingOutIcon className="size-5" />
              )}
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
              <XMarkIcon className="size-5" />
            </Button>
          </div>
        </div>

        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto",
            fullscreen ? "px-4 py-4" : "px-5 py-5",
          )}
        >
          {isLive ? (
            <div className={cn("space-y-3", fullscreen && "flex h-full flex-col")}>
              {source === "human" ? (
                <HumanPreviewMenubar
                  menu={humanMenu}
                  onMenuChange={setHumanMenu}
                  display={humanDisplay}
                  onDisplayChange={setHumanDisplay}
                  models={humanModels}
                  onModelsChange={setHumanModels}
                  input={humanInput}
                  onInputChange={setHumanInput}
                  process={humanProcess}
                  onProcessChange={setHumanProcess}
                  paused={paused}
                  onPausedChange={(next) => {
                    setPaused(next);
                    setStatus(next ? "Human · paused" : "Human preview running");
                  }}
                  running={running}
                  fps={humanFps}
                  resultsJson={resultsJson}
                />
              ) : null}
              <div
                className={cn(
                  "relative overflow-hidden rounded-xl border border-border bg-slate-950",
                  fullscreen && "flex min-h-0 flex-1 items-center justify-center",
                )}
              >
                <video ref={videoRef} className="hidden" playsInline muted />
                <canvas
                  ref={canvasRef}
                  className={cn(
                    "block h-auto w-full",
                    fullscreen && "max-h-full object-contain",
                  )}
                />
                {!running && !error ? (
                  <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-300">
                    Starting preview…
                  </div>
                ) : null}
                {running ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="absolute right-3 bottom-3 bg-black/60 text-white hover:bg-black/80"
                    onClick={() => setFullscreen((current) => !current)}
                  >
                    {fullscreen ? (
                      <>
                        <ArrowsPointingInIcon className="size-4" />
                        Exit fullscreen
                      </>
                    ) : (
                      <>
                        <ArrowsPointingOutIcon className="size-4" />
                        Fullscreen
                      </>
                    )}
                  </Button>
                ) : null}
              </div>
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {status}
              </p>
              {error ? (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              ) : null}
              {!fullscreen ? (
                <p className="text-xs text-muted-foreground">
                  This uses <span className="font-medium text-foreground">your</span> webcam for
                  testing only — not a remote customer kiosk feed.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-4 rounded-xl border border-border bg-muted/30 p-4 text-sm">
              <p className="text-foreground">{status}</p>
              {source === "auto" ? (
                <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                  <li>When the Python sidecar is connected → use Python.</li>
                  <li>Otherwise → fall back to browser camera (MediaPipe).</li>
                  <li>Use the Browser or Human preview buttons to see live camera demos.</li>
                </ul>
              ) : (
                <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                  <li>Runs as a local process on the kiosk PC (`services/vision`).</li>
                  <li>Uses YOLO person detection (+ MediaPipe hands for wave modes).</li>
                  <li>Cannot stream that kiosk camera into this dashboard.</li>
                </ul>
              )}
            </div>
          )}
        </div>

        {!fullscreen ? (
          <div className="shrink-0 border-t border-border px-5 py-4">
            <div className="flex justify-end gap-2">
              {source === "human" ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setHumanMenu(null);
                    setHumanDisplay({ ...DEFAULT_HUMAN_DISPLAY });
                    setHumanModels({ ...DEFAULT_HUMAN_MODELS });
                    setHumanInput({ ...DEFAULT_HUMAN_INPUT });
                    setHumanProcess({ ...DEFAULT_HUMAN_PROCESS });
                    setPaused(false);
                    setResultsJson(null);
                    setStatus("Human · settings reset to defaults");
                  }}
                >
                  Reset
                </Button>
              ) : null}
              {isLive ? (
                <Button variant="outline" onClick={() => setFullscreen(true)}>
                  <ArrowsPointingOutIcon className="size-4" />
                  Fullscreen
                </Button>
              ) : null}
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
