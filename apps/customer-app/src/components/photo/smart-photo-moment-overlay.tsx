"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FaceDetector, FilesetResolver } from "@mediapipe/tasks-vision";

import {
  completePhotoSession,
  respondPhotoSession,
  startPhotoSession,
  uploadPhotoSession,
  type SmartPhotoMomentConfig,
} from "@/lib/photo-api";
import { useSessionStore } from "@/store/session-store";

const WASM_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm";
const FACE_MODEL_PATH = "/models/blaze_face_short_range.tflite";
const FACE_STABLE_MS = 800;
const MIN_FACE_CONFIDENCE = 0.65;
const READY_FALLBACK_MS = 1200;
/** Brief order-complete glance before dismissing checkout so the camera isn't covered. */
const ORDER_COMPLETE_DISMISS_MS = 1500;
const PHOTO_READY_PROMPT = "Siap-siap ya untuk foto!";

export type PhotoUiPhase =
  | "idle"
  | "ready"
  | "camera"
  | "countdown"
  | "success"
  | "qr"
  | "thanks"
  | "error";

type Props = {
  businessSlug: string;
  config: SmartPhotoMomentConfig;
  orderId?: string | null;
  paymentCompleteRequest: number;
  assistantSpeaking: boolean;
  onRequestPhotoReady: (prompt: string) => void;
  onFinishOfferKeepAlive: () => void;
  disconnectVoice: () => void;
};

export function SmartPhotoMomentOverlay({
  businessSlug,
  config,
  orderId,
  paymentCompleteRequest,
  assistantSpeaking,
  onRequestPhotoReady,
  onFinishOfferKeepAlive,
  disconnectVoice,
}: Props) {
  const photoSouvenirConsent = useSessionStore((s) => s.photoSouvenirConsent);
  const closeCheckoutPanel = useSessionStore((s) => s.closeCheckoutPanel);
  const openCheckoutPanel = useSessionStore((s) => s.openCheckoutPanel);
  const [phase, setPhase] = useState<PhotoUiPhase>("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(3);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("Posisikan wajah di dalam bingkai");
  const [linkCopied, setLinkCopied] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<FaceDetector | null>(null);
  const rafRef = useRef<number>(0);
  const stableSinceRef = useRef<number | null>(null);
  const captureAttemptedRef = useRef(false);
  const retryUsedRef = useRef(false);
  const lastHandledPaymentReq = useRef(0);
  const heardReadySpeechRef = useRef(false);
  const openCameraRef = useRef<() => void>(() => undefined);

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    try {
      detectorRef.current?.close?.();
    } catch {
      // ignore
    }
    detectorRef.current = null;
  }, []);

  const finishToOrderComplete = useCallback(() => {
    stopCamera();
    setPhase("idle");
    // Restore order-complete panel so guest/staff can Start new order.
    openCheckoutPanel();
    onFinishOfferKeepAlive();
  }, [onFinishOfferKeepAlive, openCheckoutPanel, stopCamera]);

  const openCamera = useCallback(() => {
    disconnectVoice();
    closeCheckoutPanel();
    setPhase("camera");
  }, [closeCheckoutPanel, disconnectVoice]);

  useEffect(() => {
    openCameraRef.current = openCamera;
  }, [openCamera]);

  // After "I've paid": dismiss order-complete shortly, then open portrait camera
  // (unless the customer explicitly said no earlier).
  useEffect(() => {
    if (paymentCompleteRequest === 0) return;
    if (paymentCompleteRequest === lastHandledPaymentReq.current) return;
    if (!config.active || !config.enabled) return;
    lastHandledPaymentReq.current = paymentCompleteRequest;
    heardReadySpeechRef.current = false;
    setLinkCopied(false);
    setDownloadUrl(null);
    setPreviewUrl(null);
    setError(null);

    if (photoSouvenirConsent === "no") {
      disconnectVoice();
      finishToOrderComplete();
      return;
    }

    let cancelled = false;
    const dismissTimer = window.setTimeout(() => {
      if (cancelled) return;
      closeCheckoutPanel();
    }, ORDER_COMPLETE_DISMISS_MS);

    void (async () => {
      try {
        const { sessionId: id } = await startPhotoSession({
          slug: businessSlug,
          orderId,
        });
        if (cancelled) return;
        setSessionId(id);
        await respondPhotoSession(id, "yes").catch(() => undefined);
        setPhase("ready");
        onRequestPhotoReady(PHOTO_READY_PROMPT);
      } catch {
        // Still try to open camera even if session start fails later on upload.
        if (!cancelled) {
          setPhase("ready");
          onRequestPhotoReady(PHOTO_READY_PROMPT);
        }
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(dismissTimer);
    };
  }, [
    paymentCompleteRequest,
    config.active,
    config.enabled,
    businessSlug,
    orderId,
    photoSouvenirConsent,
    onRequestPhotoReady,
    disconnectVoice,
    finishToOrderComplete,
    closeCheckoutPanel,
  ]);

  // Open portrait camera shortly after the ready cue (or immediately if speech already ended).
  useEffect(() => {
    if (phase !== "ready") return;

    const fallback = window.setTimeout(() => {
      openCameraRef.current();
    }, READY_FALLBACK_MS);

    return () => window.clearTimeout(fallback);
  }, [phase]);

  useEffect(() => {
    if (phase !== "ready") return;
    if (assistantSpeaking) {
      heardReadySpeechRef.current = true;
      return;
    }
    if (heardReadySpeechRef.current) {
      openCameraRef.current();
    }
  }, [phase, assistantSpeaking]);

  const captureFrame = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const srcW = video.videoWidth || 1080;
    const srcH = video.videoHeight || 1920;
    // Crop center to Instagram Story 9:16 for the souvenir photo + frame.
    const targetRatio = 9 / 16;
    let cropW = srcW;
    let cropH = srcW / targetRatio;
    if (cropH > srcH) {
      cropH = srcH;
      cropW = srcH * targetRatio;
    }
    const sx = (srcW - cropW) / 2;
    const sy = (srcH - cropH) / 2;
    const outW = Math.round(cropW);
    const outH = Math.round(cropH);
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Mirror to match on-screen selfie preview.
    ctx.translate(outW, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, sx, sy, cropW, cropH, 0, 0, outW, outH);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92),
    );
    if (!blob) throw new Error("Capture failed");

    const url = URL.createObjectURL(blob);
    setPreviewUrl(url);
    stopCamera();
    setPhase("success");

    if (!sessionId) {
      setError("Sesi foto tidak tersedia. Coba lagi di kunjungan berikutnya.");
      setPhase("error");
      return;
    }

    try {
      await uploadPhotoSession(sessionId, blob);
      const completed = await completePhotoSession(sessionId);
      setDownloadUrl(completed.downloadUrl);
      window.setTimeout(() => setPhase("qr"), 900);
    } catch (err) {
      if (!retryUsedRef.current) {
        retryUsedRef.current = true;
        setError("Upload gagal, mencoba lagi…");
        try {
          await uploadPhotoSession(sessionId, blob);
          const completed = await completePhotoSession(sessionId);
          setDownloadUrl(completed.downloadUrl);
          setError(null);
          setPhase("qr");
          return;
        } catch {
          // fall through
        }
      }
      setError(err instanceof Error ? err.message : "Gagal mengunggah foto");
      setPhase("error");
    }
  }, [sessionId, stopCamera]);

  const startCountdown = useCallback(() => {
    if (captureAttemptedRef.current) return;
    captureAttemptedRef.current = true;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setPhase("countdown");
  }, []);

  // Camera + face detection loop (allows 1+ faces for group / photo together).
  useEffect(() => {
    if (phase !== "camera") return;

    let cancelled = false;
    captureAttemptedRef.current = false;
    stableSinceRef.current = null;

    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 1080 },
            height: { ideal: 1920 },
            aspectRatio: { ideal: 9 / 16 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const vision = await FilesetResolver.forVisionTasks(WASM_CDN);
        detectorRef.current = await FaceDetector.createFromOptions(vision, {
          baseOptions: { modelAssetPath: FACE_MODEL_PATH },
          runningMode: "VIDEO",
          minDetectionConfidence: MIN_FACE_CONFIDENCE,
        });

        let ts = 0;
        const tick = () => {
          if (cancelled || captureAttemptedRef.current) return;
          const video = videoRef.current;
          const detector = detectorRef.current;
          if (!video || !detector || video.videoWidth === 0) {
            rafRef.current = requestAnimationFrame(tick);
            return;
          }

          ts += 33;
          const result = detector.detectForVideo(video, ts);
          const detections = result.detections.filter((d) => {
            const score = d.categories?.[0]?.score ?? 0;
            return score >= MIN_FACE_CONFIDENCE && d.boundingBox;
          });

          if (detections.length === 0) {
            stableSinceRef.current = null;
            setInstruction("Hadapkan wajah ke kamera — boleh foto bareng");
            rafRef.current = requestAnimationFrame(tick);
            return;
          }

          // Use the largest face for framing guidance (group photos OK).
          const box = detections.reduce((best, d) => {
            const b = d.boundingBox!;
            const area = b.width * b.height;
            const bestArea = best.width * best.height;
            return area > bestArea ? b : best;
          }, detections[0]!.boundingBox!);

          const cx = (box.originX + box.width / 2) / video.videoWidth;
          const cy = (box.originY + box.height / 2) / video.videoHeight;
          const centered = cx > 0.2 && cx < 0.8 && cy > 0.15 && cy < 0.8;

          if (!centered) {
            stableSinceRef.current = null;
            setInstruction("Posisikan wajah di tengah bingkai");
            rafRef.current = requestAnimationFrame(tick);
            return;
          }

          setInstruction(
            detections.length > 1 ? "Siap foto bareng — tahan sebentar…" : "Tahan sebentar…",
          );
          const now = performance.now();
          if (stableSinceRef.current == null) stableSinceRef.current = now;
          if (now - stableSinceRef.current >= FACE_STABLE_MS) {
            startCountdown();
            return;
          }

          rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);
      } catch {
        setError("Izin kamera ditolak. Aktifkan kamera di pengaturan browser.");
        setPhase("error");
      }
    })();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [phase === "camera", startCountdown]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (phase !== "countdown") return;
    const seconds = Math.max(1, config.countdown_seconds || 3);
    setCountdown(seconds);
    let current = seconds;
    const interval = window.setInterval(() => {
      current -= 1;
      setCountdown(current);
      if (current <= 0) {
        window.clearInterval(interval);
        void captureFrame();
      }
    }, 1000);
    return () => window.clearInterval(interval);
  }, [phase, config.countdown_seconds, captureFrame]);

  // Keep QR / download link on screen longer so guests can scan or copy.
  useEffect(() => {
    if (phase !== "qr") return;
    const t = window.setTimeout(() => {
      setPhase("thanks");
      window.setTimeout(() => finishToOrderComplete(), 2000);
    }, 45000);
    return () => window.clearTimeout(t);
  }, [phase, finishToOrderComplete]);

  const copyDownloadLink = useCallback(async () => {
    if (!downloadUrl) return;
    try {
      await navigator.clipboard.writeText(downloadUrl);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // ignore
    }
  }, [downloadUrl]);

  if (phase === "idle") return null;

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <canvas ref={canvasRef} className="hidden" />

      {phase === "ready" ? (
        <div className="w-full max-w-sm rounded-3xl bg-white px-8 py-10 text-center shadow-2xl">
          <p className="text-2xl font-semibold text-slate-900">Siap-siap ya untuk foto!</p>
          <p className="mt-3 text-sm text-slate-500">Kamera portrait akan segera terbuka…</p>
        </div>
      ) : null}

      {(phase === "camera" || phase === "countdown") && (
        <div className="relative mx-auto aspect-[9/16] h-[min(82dvh,720px)] w-auto max-w-full overflow-hidden rounded-3xl bg-black shadow-2xl">
          <video
            ref={videoRef}
            playsInline
            muted
            className="absolute inset-0 h-full w-full object-cover"
            style={{ transform: "scaleX(-1)" }}
          />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-[58%] w-[72%] rounded-[45%] border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          </div>
          {phase === "countdown" ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              <span className="text-8xl font-bold text-white drop-shadow-lg">{countdown}</span>
            </div>
          ) : (
            <>
              <p className="absolute bottom-24 left-0 right-0 text-center text-lg text-white drop-shadow">
                {instruction}
              </p>
              <div className="absolute bottom-6 left-0 right-0 flex justify-center">
                <button
                  type="button"
                  className="rounded-full bg-white px-8 py-3 text-base font-semibold text-slate-900 shadow-lg"
                  onClick={startCountdown}
                >
                  Ambil foto
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {phase === "success" && previewUrl ? (
        <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Preview"
            className="mx-auto aspect-[9/16] max-h-[min(60dvh,520px)] w-auto rounded-2xl object-cover"
          />
          <p className="mt-4 text-xl font-semibold text-slate-900">Foto berhasil diambil!</p>
          <p className="mt-2 text-sm text-slate-500">Menyiapkan link download…</p>
        </div>
      ) : null}

      {phase === "qr" && downloadUrl ? (
        <div className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-2xl">
          <p className="text-xl font-semibold text-slate-900">Download foto kenang-kenangan</p>
          <p className="mt-2 text-sm text-slate-500">Scan QR atau buka link di bawah.</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(downloadUrl)}`}
            alt="QR download"
            className="mx-auto mt-6 size-64"
          />
          <a
            href={downloadUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-5 block break-all rounded-2xl bg-slate-50 px-4 py-3 text-sm font-medium text-blue-700 underline underline-offset-2"
          >
            {downloadUrl}
          </a>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <a
              href={downloadUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-full bg-slate-900 px-6 py-2.5 text-sm font-medium text-white"
            >
              Buka link
            </a>
            <button
              type="button"
              className="rounded-full border border-slate-300 px-6 py-2.5 text-sm font-medium text-slate-700"
              onClick={() => void copyDownloadLink()}
            >
              {linkCopied ? "Tersalin!" : "Salin link"}
            </button>
          </div>
          <button
            type="button"
            className="mt-6 text-sm font-medium text-slate-500 underline underline-offset-2"
            onClick={() => {
              setPhase("thanks");
              window.setTimeout(() => finishToOrderComplete(), 1500);
            }}
          >
            Selesai
          </button>
        </div>
      ) : null}

      {phase === "thanks" ? (
        <div className="rounded-3xl bg-white px-10 py-8 text-center shadow-2xl">
          <p className="text-2xl font-semibold text-slate-900">Terima kasih, sampai jumpa!</p>
        </div>
      ) : null}

      {phase === "error" ? (
        <div className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-2xl">
          <p className="text-lg font-semibold text-slate-900">{error ?? "Terjadi kesalahan"}</p>
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Preview"
              className="mx-auto mt-4 max-h-56 rounded-2xl object-contain"
            />
          ) : null}
          <button
            type="button"
            className="mt-6 rounded-full bg-slate-900 px-6 py-2 text-sm font-medium text-white"
            onClick={() => finishToOrderComplete()}
          >
            Tutup
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Returns true when Smart Photo Moment should intercept payment-complete disconnect. */
export function shouldOfferPhotoMoment(config: SmartPhotoMomentConfig | null | undefined): boolean {
  return Boolean(config?.active && config?.enabled);
}
