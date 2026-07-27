"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { BrowserGestureDetector } from "@/lib/browser-vision/gesture-detector";
import {
  BrowserPresenceDetector,
} from "@/lib/browser-vision/presence-detector";
import { PresenceStateMachine } from "@/lib/browser-vision/state-machine";
import type { BrowserVisionEventType } from "@/lib/browser-vision/types";
import type { VisionConfig } from "@/types/kiosk";
import { useKioskStore } from "@/store/kiosk-store";

const FRAME_INTERVAL_MS = 125; // ~8 FPS
const AUTO_GRACE_MS = 2000;

type UseBrowserVisionOptions = {
  visionEnabled: boolean;
  visionConfigSynced: boolean;
  kioskConnected: boolean;
  pythonVisionConnected: boolean;
  visionConfig: VisionConfig;
  sessionActive: boolean;
  sendVisionEvent: (event: BrowserVisionEventType, trackId?: number) => void;
  onError: (message: string | null) => void;
  onCameraReady?: () => void;
};

function shouldRunBrowserVision(
  visionEnabled: boolean,
  visionConfigSynced: boolean,
  kioskConnected: boolean,
  pythonVisionConnected: boolean,
  visionSource: VisionConfig["vision_source"],
  autoGraceElapsed: boolean,
  sessionActive: boolean,
): boolean {
  if (!visionEnabled || !visionConfigSynced || !kioskConnected || sessionActive) {
    return false;
  }
  if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return false;
  }
  if (visionSource === "python") return false;
  if (visionSource === "browser") return true;
  // auto
  return autoGraceElapsed && !pythonVisionConnected;
}

function browserCameraErrorMessage(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === "NotAllowedError") {
      return "Camera access is required for auto-greeting. Allow camera in browser settings or use manual start.";
    }
    if (err.name === "NotReadableError") {
      return "Camera is in use by another app or tab. Close it and refresh this page.";
    }
    if (err.name === "NotFoundError") {
      return "No camera found. Connect a camera and refresh this page.";
    }
    if (err.name === "AbortError") {
      return "";
    }
  }

  if (err instanceof Error && err.message.includes("hand_landmarker")) {
    return "Hand detection failed to load. Hard-refresh the page and try again.";
  }

  return "Unable to start browser camera for vision.";
}

export function useBrowserVision({
  visionEnabled,
  visionConfigSynced,
  kioskConnected,
  pythonVisionConnected,
  visionConfig,
  sessionActive,
  sendVisionEvent,
  onError,
  onCameraReady,
}: UseBrowserVisionOptions): { releaseCamera: () => void } {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [autoGraceReady, setAutoGraceReady] = useState(false);
  const graceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const presenceRef = useRef<BrowserPresenceDetector | null>(null);
  const gestureRef = useRef<BrowserGestureDetector | null>(null);
  const stateMachineRef = useRef<PresenceStateMachine | null>(null);
  const sessionActiveRef = useRef(sessionActive);
  sessionActiveRef.current = sessionActive;
  const releaseCameraRef = useRef<() => void>(() => {});
  const onCameraReadyRef = useRef(onCameraReady);
  onCameraReadyRef.current = onCameraReady;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const setBrowserVisionReady = useKioskStore((s) => s.setBrowserVisionReady);

  const visionConfigRef = useRef(visionConfig);
  visionConfigRef.current = visionConfig;
  const sendVisionEventRef = useRef(sendVisionEvent);
  sendVisionEventRef.current = sendVisionEvent;

  useEffect(() => {
    if (graceTimerRef.current) {
      clearTimeout(graceTimerRef.current);
      graceTimerRef.current = null;
    }

    if (!visionEnabled || !visionConfigSynced) {
      setAutoGraceReady(false);
      return;
    }

    if (visionConfig.vision_source === "browser") {
      setAutoGraceReady(true);
      return;
    }

    if (visionConfig.vision_source === "python") {
      setAutoGraceReady(false);
      return;
    }

    // auto
    if (pythonVisionConnected) {
      setAutoGraceReady(false);
      return;
    }

    setAutoGraceReady(false);
    graceTimerRef.current = setTimeout(() => {
      setAutoGraceReady(true);
    }, AUTO_GRACE_MS);

    return () => {
      if (graceTimerRef.current) {
        clearTimeout(graceTimerRef.current);
        graceTimerRef.current = null;
      }
    };
  }, [
    visionEnabled,
    visionConfigSynced,
    visionConfig.vision_source,
    pythonVisionConnected,
    kioskConnected,
  ]);

  useEffect(() => {
    let cancelled = false;

    const stopLoop = () => {
      if (loopTimerRef.current) {
        clearTimeout(loopTimerRef.current);
        loopTimerRef.current = null;
      }
    };

    /** Stop camera tracks for mic handoff; keep MediaPipe detectors warm for session 2. */
    const pauseCamera = () => {
      stopLoop();
      stateMachineRef.current = null;
      setBrowserVisionReady(false);

      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          track.stop();
        }
        streamRef.current = null;
      }

      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };

    /** Full teardown (page leave / vision disabled). */
    const destroyDetectors = () => {
      pauseCamera();
      gestureRef.current?.close();
      gestureRef.current = null;
      presenceRef.current?.close();
      presenceRef.current = null;
    };

    releaseCameraRef.current = pauseCamera;

    const run = async () => {
      const cfg = visionConfigRef.current;
      const active = shouldRunBrowserVision(
        visionEnabled,
        visionConfigSynced,
        kioskConnected,
        pythonVisionConnected,
        cfg.vision_source,
        autoGraceReady,
        sessionActive,
      );

      if (!active) {
        if (sessionActive) {
          pauseCamera();
        } else if (!visionEnabled || !visionConfigSynced) {
          destroyDetectors();
        } else {
          pauseCamera();
        }
        onErrorRef.current(null);
        setBrowserVisionReady(false);
        return;
      }

      if (streamRef.current) {
        return;
      }

      try {
        let stream: MediaStream | null = null;
        let lastError: unknown;

        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: {
                facingMode: "user",
                width: { ideal: 640 },
                height: { ideal: 480 },
              },
              audio: false,
            });
            lastError = null;
            break;
          } catch (error) {
            lastError = error;
            if (cancelled) return;
            if (attempt < 2) {
              await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
            }
          }
        }

        if (!stream) {
          throw lastError ?? new Error("Camera access failed.");
        }

        if (cancelled) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }

        streamRef.current = stream;
        onErrorRef.current(null);
        onCameraReadyRef.current?.();

        if (!videoRef.current) {
          videoRef.current = document.createElement("video");
          videoRef.current.playsInline = true;
          videoRef.current.muted = true;
          videoRef.current.autoplay = true;
        }

        const video = videoRef.current;
        video.srcObject = stream;
        await video.play();

        if (!presenceRef.current) {
          const presence = new BrowserPresenceDetector();
          await presence.init();
          presenceRef.current = presence;
        }
        const presence = presenceRef.current;
        presence.setDetectionDistanceM(cfg.detection_distance_m);

        const usesHands =
          cfg.greeting_trigger_mode === "gesture" ||
          cfg.greeting_trigger_mode === "raise_hand";

        if (usesHands && !gestureRef.current) {
          const gesture = new BrowserGestureDetector();
          await gesture.init();
          gestureRef.current = gesture;
        } else if (!usesHands && gestureRef.current) {
          gestureRef.current.close();
          gestureRef.current = null;
        }

        if (cancelled || !streamRef.current) {
          return;
        }

        const stateMachine = new PresenceStateMachine(
          cfg.greeting_delay_seconds,
          (event) => {
            if (sessionActiveRef.current) return;
            sendVisionEventRef.current(
              event.type as BrowserVisionEventType,
              event.track_id,
            );
            if (event.type === "PERSON_CONFIRMED") {
              stateMachine.notifySessionActive();
            }
          },
          cfg.greeting_trigger_mode,
        );
        stateMachineRef.current = stateMachine;

        const tick = () => {
          if (cancelled || !streamRef.current || !presenceRef.current) return;

          const currentCfg = visionConfigRef.current;
          const presenceDetector = presenceRef.current;
          presenceDetector.setDetectionDistanceM(currentCfg.detection_distance_m);
          stateMachine.setGreetingDelaySeconds(currentCfg.greeting_delay_seconds);
          stateMachine.setTriggerMode(currentCfg.greeting_trigger_mode);

          let primary = presenceDetector.detectPrimary(video);
          let waveDetected = false;
          let handRaised = false;

          const handMode =
            currentCfg.greeting_trigger_mode === "gesture" ||
            currentCfg.greeting_trigger_mode === "raise_hand";

          if (handMode && gestureRef.current) {
            const gesture = gestureRef.current.detect(video);
            waveDetected = gesture.wave_detected;
            handRaised = gesture.hand_raised;
            if (!primary && handRaised) {
              primary = BrowserPresenceDetector.syntheticFromHandRaised();
            }
          }

          stateMachine.onFrame(primary, waveDetected, handRaised);
          loopTimerRef.current = setTimeout(tick, FRAME_INTERVAL_MS);
        };

        setBrowserVisionReady(true);
        tick();
      } catch (err) {
        pauseCamera();
        if (cancelled) return;
        const message = browserCameraErrorMessage(err);
        if (message) {
          onErrorRef.current(message);
        }
        setBrowserVisionReady(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
      // On dependency change while still enabled, pause camera but keep detectors.
      // Full destroy only when vision is turned off or the hook unmounts with vision off.
      if (!visionEnabled || !visionConfigSynced) {
        destroyDetectors();
      } else {
        pauseCamera();
      }
    };
  }, [
    visionEnabled,
    visionConfigSynced,
    kioskConnected,
    pythonVisionConnected,
    visionConfig.vision_source,
    visionConfig.greeting_trigger_mode,
    visionConfig.detection_distance_m,
    visionConfig.greeting_delay_seconds,
    sessionActive,
    autoGraceReady,
    setBrowserVisionReady,
  ]);

  useEffect(() => {
    if (sessionActive) {
      stateMachineRef.current?.notifySessionActive();
      setBrowserVisionReady(false);
    } else {
      stateMachineRef.current?.notifySessionEnded();
      gestureRef.current?.reset();
    }
  }, [sessionActive, setBrowserVisionReady]);

  useEffect(() => {
    return () => {
      gestureRef.current?.close();
      gestureRef.current = null;
      presenceRef.current?.close();
      presenceRef.current = null;
      setBrowserVisionReady(false);
    };
  }, [setBrowserVisionReady]);

  const releaseCamera = useCallback(() => {
    releaseCameraRef.current();
  }, []);

  return { releaseCamera };
}
