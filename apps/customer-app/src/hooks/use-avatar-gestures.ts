"use client";

import { useCallback, useState, useRef, useEffect } from "react";
import {
  GREETING_WAVE_CLIP,
  THUMBS_UP_CLIP,
  TALKING_HAND_GESTURE_CLIP,
  TALKING_HAND_GESTURE_CHANCE,
} from "@voicetalk/avatar";

const ACKNOWLEDGE_WORD_RE = /\b(?:ok(?:ay)?|baik)\b/i;
const THUMBS_UP_CHANCE = 0.35;

export function useAvatarGestures() {
  const [gestureClip, setGestureClip] = useState<any | null>(null);
  
  const greetingPoseEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thumbsUpPoseEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const talkingHandPoseEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (greetingPoseEndTimerRef.current) clearTimeout(greetingPoseEndTimerRef.current);
    if (thumbsUpPoseEndTimerRef.current) clearTimeout(thumbsUpPoseEndTimerRef.current);
    if (talkingHandPoseEndTimerRef.current) clearTimeout(talkingHandPoseEndTimerRef.current);
    greetingPoseEndTimerRef.current = null;
    thumbsUpPoseEndTimerRef.current = null;
    talkingHandPoseEndTimerRef.current = null;
  }, []);

  const triggerGreetingWave = useCallback(() => {
    clearTimers();
    setGestureClip(GREETING_WAVE_CLIP);
    greetingPoseEndTimerRef.current = setTimeout(() => {
      setGestureClip(null);
      greetingPoseEndTimerRef.current = null;
    }, Math.round(GREETING_WAVE_CLIP.period * 1000));
  }, [clearTimers]);

  const triggerThumbsUp = useCallback(() => {
    // Check if wave is active to avoid overriding
    if (greetingPoseEndTimerRef.current) return;
    
    clearTimers();
    setGestureClip(THUMBS_UP_CLIP);
    thumbsUpPoseEndTimerRef.current = setTimeout(() => {
      setGestureClip(null);
      thumbsUpPoseEndTimerRef.current = null;
    }, Math.round(THUMBS_UP_CLIP.period * 1000));
  }, [clearTimers]);

  const triggerTalkingHandGesture = useCallback(() => {
    if (greetingPoseEndTimerRef.current || thumbsUpPoseEndTimerRef.current) return;
    
    clearTimers();
    setGestureClip(TALKING_HAND_GESTURE_CLIP);
    talkingHandPoseEndTimerRef.current = setTimeout(() => {
      setGestureClip(null);
      talkingHandPoseEndTimerRef.current = null;
    }, Math.round(TALKING_HAND_GESTURE_CLIP.period * 1000));
  }, [clearTimers]);

  const maybeTriggerThumbsUpFromText = useCallback((text: string) => {
    if (!ACKNOWLEDGE_WORD_RE.test(text)) return;
    if (Math.random() >= THUMBS_UP_CHANCE) return;
    triggerThumbsUp();
  }, [triggerThumbsUp]);

  const maybeTriggerTalkingHandOnSpeech = useCallback(() => {
    if (Math.random() >= TALKING_HAND_GESTURE_CHANCE) return;
    triggerTalkingHandGesture();
  }, [triggerTalkingHandGesture]);

  useEffect(() => {
    return clearTimers;
  }, [clearTimers]);

  return {
    gestureClip,
    triggerGreetingWave,
    triggerThumbsUp,
    triggerTalkingHandGesture,
    maybeTriggerThumbsUpFromText,
    maybeTriggerTalkingHandOnSpeech,
  };
}
