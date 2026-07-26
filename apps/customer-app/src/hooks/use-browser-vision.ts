"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { BrowserGestureDetector } from "@/lib/browser-vision/gesture-detector";
import {
  BrowserPresenceDetector,
} from "@/lib/browser-vision/presence-detector";
import { PresenceStateMachine } from "@/lib/browser-vision/state-machine";
import type { BrowserVisionEventType } from "@/lib/browser-vision/types";
import type { VisionConfig } from "@/types/kiosk";

const FRAME_INTERVAL_MS = 125; // ~8 FPS
const AUTO_GRACE_MS = 2000;

type UseBrowserVisionOptions = {
  visionEnabled: boolean;
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
  kioskConnected: boolean,
  pythonVisionConnected: boolean,
  visionSource: VisionConfig["vision_source"],
  autoGraceElapsed: boolean,
  sessionActive: boolean,
): boolean {
  if (!visionEnabled || !kioskConnected || sessionActive) return false;
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

  const visionConfigRef = useRef(visionConfig);
  visionConfigRef.current = visionConfig;

  useEffect(() => {
    if (graceTimerRef.current) {
      clearTimeout(graceTimerRef.current);
      graceTimerRef.current = null;
    }

    if (!visionEnabled) {
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

    const releaseCamera = () => {
      stopLoop();
      gestureRef.current?.close();
      gestureRef.current = null;
      presenceRef.current?.close();
      presenceRef.current = null;
      stateMachineRef.current = null;

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

    releaseCameraRef.current = releaseCamera;

    const run = async () => {
      const cfg = visionConfigRef.current;
      const active = shouldRunBrowserVision(
        visionEnabled,
        kioskConnected,
        pythonVisionConnected,
        cfg.vision_source,
        autoGraceReady,
        sessionActive,
      );

      if (!active) {
        releaseCamera();
        onErrorRef.current(null);
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

        const presence = new BrowserPresenceDetector();
        await presence.init();
        presence.setDetectionDistanceM(cfg.detection_distance_m);
        presenceRef.current = presence;

        const usesHands =
          cfg.greeting_trigger_mode === "gesture" ||
          cfg.greeting_trigger_mode === "raise_hand";

        if (usesHands) {
          const gesture = new BrowserGestureDetector();
          await gesture.init();
          gestureRef.current = gesture;
        }

        const stateMachine = new PresenceStateMachine(
          cfg.greeting_delay_seconds,
          (event) => {
            if (sessionActiveRef.current) return;
            sendVisionEvent(event.type as BrowserVisionEventType, event.track_id);
            if (event.type === "PERSON_CONFIRMED") {
              stateMachine.notifySessionActive();
            }
          },
          cfg.greeting_trigger_mode,
        );
        stateMachineRef.current = stateMachine;

        const tick = () => {
          if (cancelled || !streamRef.current) return;

          const currentCfg = visionConfigRef.current;
          presence.setDetectionDistanceM(currentCfg.detection_distance_m);
          stateMachine.setGreetingDelaySeconds(currentCfg.greeting_delay_seconds);
          stateMachine.setTriggerMode(currentCfg.greeting_trigger_mode);

          let primary = presence.detectPrimary(video);
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

        tick();
      } catch (err) {
        releaseCamera();
        if (cancelled) return;
        const message = browserCameraErrorMessage(err);
        if (message) {
          onErrorRef.current(message);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
      releaseCamera();
    };
  }, [
    visionEnabled,
    kioskConnected,
    pythonVisionConnected,
    visionConfig.vision_source,
    visionConfig.greeting_trigger_mode,
    visionConfig.detection_distance_m,
    visionConfig.greeting_delay_seconds,
    sessionActive,
    autoGraceReady,
    sendVisionEvent,
  ]);

  useEffect(() => {
    if (sessionActive) {
      stateMachineRef.current?.notifySessionActive();
    } else {
      stateMachineRef.current?.notifySessionEnded();
      gestureRef.current?.reset();
    }
  }, [sessionActive]);

  const releaseCamera = useCallback(() => {
    releaseCameraRef.current();
  }, []);

  return { releaseCamera };
}
