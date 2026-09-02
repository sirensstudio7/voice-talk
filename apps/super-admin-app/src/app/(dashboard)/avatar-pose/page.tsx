"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  DEFAULT_EXPRESSION_WEIGHTS,
  DEFAULT_IDLE_POSE_OFFSETS,
  DEFAULT_MODEL_PATH,
  cloneExpression,
  type AvatarExpressionWeights,
  type AvatarIdlePoseOffsets,
} from "@voicetalk/avatar";
import {
  ArrowDownTrayIcon,
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  ArrowUpTrayIcon,
  BookmarkSquareIcon,
  CheckIcon,
  ClipboardDocumentIcon,
  FolderOpenIcon,
  PlayIcon,
  UserCircleIcon,
} from "@heroicons/react/24/outline";

import {
  AvatarPoseAdjustPanel,
} from "@/components/avatar-pose/AvatarPoseAdjustPanel";
import { AvatarPoseTimeline } from "@/components/avatar-pose/AvatarPoseTimeline";
import { PageHeader } from "@/components/UiBlocks";
import {
  buildKeyframeClipboard,
  buildPoseClip,
  clonePose,
  createPoseTrack,
  deleteSavedPoseClip,
  downloadPoseClipJson,
  findKeyframeNear,
  getSavedPoseClip,
  listSavedPoseClips,
  newKeyframeId,
  parseKeyframeClipboard,
  parsePoseClipJson,
  sampleExpressionClip,
  sampleExpressionsTogether,
  samplePoseClip,
  sampleTracksTogether,
  savePoseClipRecord,
  sortKeyframes,
  type PoseKeyframe,
  type PoseKeyframeClipboard,
  type PoseTimelineTrack,
  type SavedPoseClipRecord,
} from "@/lib/avatar-pose-clip";
import { cn } from "@/lib/cn";

const AvatarHero = dynamic(
  () => import("@voicetalk/avatar").then((mod) => ({ default: mod.AvatarHero })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[360px] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-orange-200 border-t-orange-500" />
          <p className="text-sm font-medium text-muted-foreground">Loading preview…</p>
        </div>
      </div>
    ),
  },
);

type AvatarModelOption = {
  id: string;
  label: string;
  description: string;
  modelPath: string;
};

const AVATAR_MODELS: AvatarModelOption[] = [
  {
    id: "lorescale",
    label: "Lorescale",
    description: "Head-only · Angelica",
    modelPath: DEFAULT_MODEL_PATH,
  },
  {
    id: "alya",
    label: "Alya",
    description: "Full body · Mixamo",
    modelPath: "/models/tran-thi-ngoc-tham.glb",
  },
  {
    id: "alex",
    label: "Alex",
    description: "Full body · Mixamo",
    modelPath: "/models/thanh.glb",
  },
  {
    id: "maya",
    label: "Maya",
    description: "Full body · Mixamo",
    modelPath: "/models/tham-color.glb",
  },
];

const KEYFRAME_SNAP = 0.05;
const HISTORY_LIMIT = 50;

type PoseHistorySnapshot = {
  tracks: PoseTimelineTrack[];
  activeTrackId: string;
  selectedKeyframeId: string | null;
  idlePose: AvatarIdlePoseOffsets;
  expression: AvatarExpressionWeights;
  loopTime: number;
  duration: number;
};

function cloneTracks(tracks: PoseTimelineTrack[]): PoseTimelineTrack[] {
  return tracks.map((track) => ({
    id: track.id,
    name: track.name,
    keyframes: track.keyframes.map((kf) => ({
      id: kf.id,
      time: kf.time,
      pose: clonePose(kf.pose),
      expression: cloneExpression(kf.expression),
    })),
  }));
}

export default function AvatarPosePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editClipId = searchParams.get("edit");
  const [selectedId, setSelectedId] = useState(AVATAR_MODELS[2]?.id ?? AVATAR_MODELS[0].id);
  const selected =
    AVATAR_MODELS.find((model) => model.id === selectedId) ?? AVATAR_MODELS[0];
  const [idlePose, setIdlePose] = useState<AvatarIdlePoseOffsets>(() =>
    clonePose(DEFAULT_IDLE_POSE_OFFSETS),
  );
  const [expression, setExpression] = useState<AvatarExpressionWeights>(() =>
    cloneExpression(DEFAULT_EXPRESSION_WEIGHTS),
  );
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(4);
  const [loopTime, setLoopTime] = useState(0);
  const [jitter, setJitter] = useState(0);
  const initialTrackRef = useRef<PoseTimelineTrack | null>(null);
  if (!initialTrackRef.current) initialTrackRef.current = createPoseTrack("Pose");
  const [tracks, setTracks] = useState<PoseTimelineTrack[]>([initialTrackRef.current]);
  const [activeTrackId, setActiveTrackId] = useState(initialTrackRef.current.id);
  const [selectedKeyframeId, setSelectedKeyframeId] = useState<string | null>(null);
  const [clipCopied, setClipCopied] = useState(false);
  const [keyframeCopied, setKeyframeCopied] = useState(false);
  const [keyframeClipboard, setKeyframeClipboard] = useState<PoseKeyframeClipboard | null>(
    null,
  );
  const [clipTitle, setClipTitle] = useState("");
  const [jsonDraft, setJsonDraft] = useState("");
  const [editingClipId, setEditingClipId] = useState<string | null>(null);
  const [savedClips, setSavedClips] = useState<SavedPoseClipRecord[]>([]);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonTextareaRef = useRef<HTMLTextAreaElement>(null);

  const activeTrack = tracks.find((track) => track.id === activeTrackId) ?? tracks[0];
  const keyframes = activeTrack?.keyframes ?? [];
  const sortedKeyframes = useMemo(() => sortKeyframes(keyframes), [keyframes]);
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;
  const durationRef = useRef(duration);
  durationRef.current = duration;
  const idlePoseRef = useRef(idlePose);
  idlePoseRef.current = idlePose;
  const expressionRef = useRef(expression);
  expressionRef.current = expression;
  const loopTimeRef = useRef(loopTime);
  loopTimeRef.current = loopTime;
  const activeTrackIdRef = useRef(activeTrackId);
  activeTrackIdRef.current = activeTrackId;
  const selectedKeyframeIdRef = useRef<string | null>(null);
  selectedKeyframeIdRef.current = selectedKeyframeId;
  const pastRef = useRef<PoseHistorySnapshot[]>([]);
  const futureRef = useRef<PoseHistorySnapshot[]>([]);
  const skipHistoryRef = useRef(false);
  const poseGestureArmedRef = useRef(true);
  const moveGestureArmedRef = useRef(true);
  const [historyTick, setHistoryTick] = useState(0);

  const captureSnapshot = (): PoseHistorySnapshot => ({
    tracks: cloneTracks(tracksRef.current),
    activeTrackId: activeTrackIdRef.current,
    selectedKeyframeId: selectedKeyframeIdRef.current,
    idlePose: clonePose(idlePoseRef.current),
    expression: cloneExpression(expressionRef.current),
    loopTime: loopTimeRef.current,
    duration: durationRef.current,
  });

  const pushHistory = () => {
    if (skipHistoryRef.current) return;
    pastRef.current = [...pastRef.current, captureSnapshot()].slice(-HISTORY_LIMIT);
    futureRef.current = [];
    setHistoryTick((value) => value + 1);
  };

  const applySnapshot = (snapshot: PoseHistorySnapshot) => {
    skipHistoryRef.current = true;
    setPlaying(false);
    setTracks(cloneTracks(snapshot.tracks));
    setActiveTrackId(snapshot.activeTrackId);
    setSelectedKeyframeId(snapshot.selectedKeyframeId);
    setIdlePose(clonePose(snapshot.idlePose));
    setExpression(cloneExpression(snapshot.expression));
    setLoopTime(snapshot.loopTime);
    setDuration(snapshot.duration);
    queueMicrotask(() => {
      skipHistoryRef.current = false;
    });
    setHistoryTick((value) => value + 1);
  };

  const undo = () => {
    const past = pastRef.current;
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    pastRef.current = past.slice(0, -1);
    futureRef.current = [...futureRef.current, captureSnapshot()].slice(-HISTORY_LIMIT);
    applySnapshot(previous);
  };

  const redo = () => {
    const future = futureRef.current;
    if (future.length === 0) return;
    const next = future[future.length - 1];
    futureRef.current = future.slice(0, -1);
    pastRef.current = [...pastRef.current, captureSnapshot()].slice(-HISTORY_LIMIT);
    applySnapshot(next);
  };

  const canUndo = historyTick >= 0 && pastRef.current.length > 0;
  const canRedo = historyTick >= 0 && futureRef.current.length > 0;

  const setKeyframes = (
    update: PoseKeyframe[] | ((list: PoseKeyframe[]) => PoseKeyframe[]),
  ) => {
    setTracks((prev) => {
      const currentId = activeTrackIdRef.current || prev[0]?.id;
      return prev.map((track) => {
        if (track.id !== currentId) return track;
        const next = typeof update === "function" ? update(track.keyframes) : update;
        return { ...track, keyframes: next };
      });
    });
  };

  // While editing, the adjust panel owns the pose (idlePose).
  // While playing, RAF composites every track into idlePose each frame.
  const displayPose = idlePose;

  useEffect(() => {
    setSavedClips(listSavedPoseClips());
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === stageRef.current);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    const armGestures = () => {
      poseGestureArmedRef.current = true;
      moveGestureArmedRef.current = true;
    };
    window.addEventListener("pointerup", armGestures);
    window.addEventListener("pointercancel", armGestures);
    return () => {
      window.removeEventListener("pointerup", armGestures);
      window.removeEventListener("pointercancel", armGestures);
    };
  }, []);

  useEffect(() => {
    if (!playing) return;
    setSelectedKeyframeId(null);
    let raf = 0;
    let last = performance.now();
    let time = loopTime;
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const period = Math.max(0.1, durationRef.current);
      time = (time + dt) % period;
      setLoopTime(time);
      const blended = sampleTracksTogether(tracksRef.current, time, period);
      if (blended) setIdlePose(blended);
      setExpression(sampleExpressionsTogether(tracksRef.current, time, period));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loopTime only seeds start; tracks via ref
  }, [playing]);

  useEffect(() => {
    if (skipHistoryRef.current) return;
    setLoopTime((t) => Math.min(t, duration));
    setTracks((prev) =>
      prev.map((track) => ({
        ...track,
        keyframes: track.keyframes
          .map((kf) => ({ ...kf, time: Math.min(kf.time, duration) }))
          .filter((kf, index, arr) => {
            if (index === 0) return true;
            return !(kf.time === arr[index - 1].time && kf.time === duration);
          }),
      })),
    );
  }, [duration]);

  const toggleFullscreen = async () => {
    const el = stageRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement === el) {
        await document.exitFullscreen();
      } else {
        await el.requestFullscreen();
      }
    } catch {
      // Browser denied fullscreen — ignore.
    }
  };

  const poseAtTimeForTrack = (track: PoseTimelineTrack | undefined, time: number) => {
    if (!track || track.keyframes.length === 0) {
      return clonePose(DEFAULT_IDLE_POSE_OFFSETS);
    }
    if (track.keyframes.length === 1) {
      return clonePose(track.keyframes[0].pose);
    }
    return samplePoseClip(track.keyframes, time, duration) ?? clonePose(track.keyframes[0].pose);
  };

  const expressionAtTimeForTrack = (
    track: PoseTimelineTrack | undefined,
    time: number,
  ): AvatarExpressionWeights => {
    if (!track || track.keyframes.length === 0) {
      return cloneExpression(DEFAULT_EXPRESSION_WEIGHTS);
    }
    return sampleExpressionClip(track.keyframes, time, duration);
  };

  const selectTrack = (trackId: string) => {
    if (trackId === activeTrackId) return;
    // Do not pause — play keeps running all tracks together.
    setActiveTrackId(trackId);
    setSelectedKeyframeId(null);
    const track = tracks.find((item) => item.id === trackId);
    if (!playing) {
      setIdlePose(poseAtTimeForTrack(track, loopTime));
      setExpression(expressionAtTimeForTrack(track, loopTime));
    }
  };

  const addTrack = () => {
    pushHistory();
    const nextIndex = tracks.length + 1;
    const track = createPoseTrack(`Pose ${nextIndex}`);
    setTracks((prev) => [...prev, track]);
    setActiveTrackId(track.id);
    setSelectedKeyframeId(null);
    setPlaying(false);
    setIdlePose(clonePose(DEFAULT_IDLE_POSE_OFFSETS));
    setExpression(cloneExpression(DEFAULT_EXPRESSION_WEIGHTS));
  };

  const removeTrack = (trackId: string) => {
    if (tracks.length <= 1) return;
    pushHistory();
    const nextTracks = tracks.filter((track) => track.id !== trackId);
    setTracks(nextTracks);
    if (activeTrackId === trackId) {
      const fallback = nextTracks[0];
      setActiveTrackId(fallback.id);
      setSelectedKeyframeId(null);
      setIdlePose(poseAtTimeForTrack(fallback, loopTime));
      setExpression(expressionAtTimeForTrack(fallback, loopTime));
    }
  };

  const selectKeyframe = (kf: PoseKeyframe) => {
    setPlaying(false);
    setSelectedKeyframeId(kf.id);
    setLoopTime(kf.time);
    setIdlePose(clonePose(kf.pose));
    setExpression(cloneExpression(kf.expression));
  };

  const moveKeyframe = (id: string, time: number) => {
    if (moveGestureArmedRef.current) {
      pushHistory();
      moveGestureArmedRef.current = false;
    }
    setPlaying(false);
    setSelectedKeyframeId(id);
    setLoopTime(time);
    setTracks((prev) =>
      prev.map((track) => {
        if (!track.keyframes.some((kf) => kf.id === id)) return track;
        return {
          ...track,
          keyframes: track.keyframes.map((kf) => (kf.id === id ? { ...kf, time } : kf)),
        };
      }),
    );
  };

  const addOrUpdateKeyframe = () => {
    pushHistory();
    setPlaying(false);
    const near = findKeyframeNear(keyframes, loopTime, KEYFRAME_SNAP);
    const pose = clonePose(idlePose);
    const expr = cloneExpression(expression);
    if (near) {
      setKeyframes((list) =>
        list.map((kf) =>
          kf.id === near.id ? { ...kf, pose, expression: expr } : kf,
        ),
      );
      setSelectedKeyframeId(near.id);
      setIdlePose(pose);
      setExpression(expr);
      return;
    }
    const id = newKeyframeId();
    setKeyframes((list) => [
      ...list,
      { id, time: Number(loopTime.toFixed(3)), pose, expression: expr },
    ]);
    setSelectedKeyframeId(id);
    setIdlePose(pose);
    setExpression(expr);
  };

  const updateSelectedKeyframe = () => {
    if (!selectedKeyframeId) {
      addOrUpdateKeyframe();
      return;
    }
    pushHistory();
    setKeyframes((list) =>
      list.map((kf) =>
        kf.id === selectedKeyframeId
          ? { ...kf, pose: clonePose(idlePose), expression: cloneExpression(expression) }
          : kf,
      ),
    );
  };

  const deleteSelectedKeyframe = () => {
    if (!selectedKeyframeId) return;
    pushHistory();
    setKeyframes((list) => list.filter((kf) => kf.id !== selectedKeyframeId));
    setSelectedKeyframeId(null);
  };

  const clearKeyframes = () => {
    pushHistory();
    setKeyframes([]);
    setSelectedKeyframeId(null);
  };

  const copySelectedKeyframe = async () => {
    const selectedKf = keyframes.find((kf) => kf.id === selectedKeyframeId);
    if (!selectedKf) return;
    const payload = buildKeyframeClipboard(
      selectedKf.pose,
      selectedKf.time,
      selectedKf.expression,
    );
    setKeyframeClipboard(payload);
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setKeyframeCopied(true);
      window.setTimeout(() => setKeyframeCopied(false), 1500);
    } catch {
      // Still keep in-memory clipboard for Paste kf.
      setKeyframeCopied(true);
      window.setTimeout(() => setKeyframeCopied(false), 1500);
    }
  };

  const pasteKeyframeAtPlayhead = async () => {
    setPlaying(false);
    let payload = keyframeClipboard;
    try {
      const raw = await navigator.clipboard.readText();
      const parsed = parseKeyframeClipboard(raw);
      if (parsed) {
        payload = parsed;
        setKeyframeClipboard(parsed);
      }
    } catch {
      // Fall back to in-memory clipboard.
    }
    if (!payload) return;

    pushHistory();
    const near = findKeyframeNear(keyframes, loopTime, KEYFRAME_SNAP);
    const expr = cloneExpression(payload.expression);
    if (near) {
      setKeyframes((list) =>
        list.map((kf) =>
          kf.id === near.id
            ? { ...kf, pose: clonePose(payload.pose), expression: expr }
            : kf,
        ),
      );
      setSelectedKeyframeId(near.id);
      setIdlePose(clonePose(payload.pose));
      setExpression(expr);
      return;
    }

    const id = newKeyframeId();
    const time = Number(loopTime.toFixed(3));
    setKeyframes((list) => [
      ...list,
      { id, time, pose: clonePose(payload.pose), expression: expr },
    ]);
    setSelectedKeyframeId(id);
    setIdlePose(clonePose(payload.pose));
    setExpression(expr);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable) {
        return;
      }
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;
      if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
        return;
      }
      if (event.key.toLowerCase() === "c") {
        if (!selectedKeyframeId) return;
        event.preventDefault();
        void copySelectedKeyframe();
      } else if (event.key.toLowerCase() === "v") {
        event.preventDefault();
        void pasteKeyframeAtPlayhead();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers use latest state via closure refresh
  }, [selectedKeyframeId, keyframes, loopTime, keyframeClipboard]);

  const onPoseChange = (pose: AvatarIdlePoseOffsets) => {
    if (poseGestureArmedRef.current) {
      pushHistory();
      poseGestureArmedRef.current = false;
    }
    const next = clonePose(pose);
    setIdlePose(next);
    if (playing) return;
    const selectedId = selectedKeyframeIdRef.current;
    if (!selectedId) return;
    setKeyframes((list) =>
      list.map((kf) => (kf.id === selectedId ? { ...kf, pose: clonePose(next) } : kf)),
    );
  };

  const onExpressionChange = (nextExpression: AvatarExpressionWeights) => {
    if (poseGestureArmedRef.current) {
      pushHistory();
      poseGestureArmedRef.current = false;
    }
    const next = cloneExpression(nextExpression);
    setExpression(next);
    if (playing) return;
    const selectedId = selectedKeyframeIdRef.current;
    if (!selectedId) return;
    setKeyframes((list) =>
      list.map((kf) =>
        kf.id === selectedId ? { ...kf, expression: cloneExpression(next) } : kf,
      ),
    );
  };

  const onScrub = (time: number) => {
    setPlaying(false);
    setLoopTime(time);
    const near = findKeyframeNear(keyframes, time, KEYFRAME_SNAP);
    if (near) {
      setSelectedKeyframeId(near.id);
      setIdlePose(clonePose(near.pose));
      setExpression(cloneExpression(near.expression));
      return;
    }
    setSelectedKeyframeId(null);
    // Preview every track together while scrubbing.
    const blended = sampleTracksTogether(tracks, time, duration);
    if (blended) {
      setIdlePose(blended);
    } else if (keyframes.length >= 1) {
      const sampled = samplePoseClip(keyframes, time, duration);
      if (sampled) setIdlePose(sampled);
    }
    setExpression(sampleExpressionsTogether(tracks, time, duration));
  };

  const buildCurrentClip = () =>
    buildPoseClip(keyframes, duration, {
      modelId: selected.id,
      title: clipTitle || `${selected.label} clip`,
    });

  const syncJsonDraftFromTimeline = () => {
    setJsonDraft(JSON.stringify(buildCurrentClip(), null, 2));
  };

  const focusJsonEditor = () => {
    window.requestAnimationFrame(() => {
      jsonTextareaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      jsonTextareaRef.current?.focus();
    });
  };

  const applyClipToEditor = (
    clip: ReturnType<typeof buildPoseClip>,
    options?: { focusJson?: boolean; startPlaying?: boolean },
  ) => {
    const startPlaying = options?.startPlaying ?? false;
    const focusJson = options?.focusJson ?? !startPlaying;
    pushHistory();
    setPlaying(startPlaying);
    setClipTitle(clip.title);
    setDuration(clip.period);
    setLoopTime(0);
    setSelectedKeyframeId(null);
    const loaded = clip.keyframes.map((kf) => ({
      id: newKeyframeId(),
      time: kf.time,
      pose: clonePose(kf.pose),
      expression: cloneExpression(kf.expression),
    }));
    setKeyframes(loaded);
    if (loaded[0]) {
      setIdlePose(clonePose(loaded[0].pose));
      setExpression(cloneExpression(loaded[0].expression));
      setSelectedKeyframeId(loaded[0].id);
      // Start from beginning when playing; otherwise snap to first keyframe.
      setLoopTime(startPlaying ? 0 : loaded[0].time);
    } else {
      setIdlePose(clonePose(DEFAULT_IDLE_POSE_OFFSETS));
      setExpression(cloneExpression(DEFAULT_EXPRESSION_WEIGHTS));
    }
    if (clip.modelId) {
      const match = AVATAR_MODELS.find((model) => model.id === clip.modelId);
      if (match) setSelectedId(match.id);
    }
    setJsonDraft(JSON.stringify(clip, null, 2));
    if (focusJson) focusJsonEditor();
    if (startPlaying) {
      window.requestAnimationFrame(() => {
        stageRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  };

  const playSavedClip = (clip: SavedPoseClipRecord) => {
    if (clip.keyframes.length === 0) {
      setSaveMessage("This clip has no keyframes to play.");
      return;
    }
    applyClipToEditor(clip, { startPlaying: true, focusJson: false });
    setSaveMessage(`Playing “${clip.title}”.`);
    window.setTimeout(() => setSaveMessage(null), 2000);
  };

  useEffect(() => {
    if (!editClipId) return;
    const clip = getSavedPoseClip(editClipId);
    if (!clip) {
      setSaveMessage("Saved clip not found.");
      return;
    }
    setEditingClipId(clip.id);
    applyClipToEditor(clip);
    setSaveMessage(`Editing “${clip.title}”.`);
    window.setTimeout(() => setSaveMessage(null), 2000);
    router.replace("/avatar-pose", { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once when edit query appears
  }, [editClipId]);

  const applyJsonDraft = () => {
    const result = parsePoseClipJson(jsonDraft, {
      title: clipTitle,
      period: duration,
      modelId: selected.id,
    });
    if ("error" in result) {
      setSaveMessage(result.error);
      return;
    }
    applyClipToEditor(result.clip);
    setSaveMessage(`Applied “${result.clip.title}” to timeline.`);
    window.setTimeout(() => setSaveMessage(null), 2000);
  };

  const copyClipJson = async () => {
    const clip = buildCurrentClip();
    const text = JSON.stringify(clip, null, 2);
    setJsonDraft(text);
    try {
      await navigator.clipboard.writeText(text);
      setClipCopied(true);
      window.setTimeout(() => setClipCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  const saveClipJson = () => {
    // Prefer textarea contents when present; otherwise timeline.
    const source = jsonDraft.trim()
      ? parsePoseClipJson(jsonDraft, {
          title: clipTitle,
          period: duration,
          modelId: selected.id,
        })
      : { clip: buildCurrentClip() };

    if ("error" in source) {
      setSaveMessage(source.error);
      return;
    }

    if (source.clip.keyframes.length === 0) {
      setSaveMessage("Add keyframes or paste valid JSON before saving.");
      return;
    }

    // Keep title field in sync if user typed one.
    const clip = {
      ...source.clip,
      title: clipTitle.trim() || source.clip.title,
    };

    const record = savePoseClipRecord(clip, {
      id: editingClipId ?? undefined,
    });
    setEditingClipId(record.id);
    setSavedClips(listSavedPoseClips());
    applyClipToEditor(clip);
    setSaveMessage(`Saved “${record.title}”.`);
    window.setTimeout(() => setSaveMessage(null), 2000);
  };

  const downloadClipJson = () => {
    const source = jsonDraft.trim()
      ? parsePoseClipJson(jsonDraft, {
          title: clipTitle,
          period: duration,
          modelId: selected.id,
        })
      : { clip: buildCurrentClip() };

    if ("error" in source) {
      setSaveMessage(source.error);
      return;
    }
    if (source.clip.keyframes.length === 0) {
      setSaveMessage("Add keyframes or paste valid JSON before downloading.");
      return;
    }
    const clip = {
      ...source.clip,
      title: clipTitle.trim() || source.clip.title,
    };
    downloadPoseClipJson(clip);
    setSaveMessage("Downloaded JSON file.");
    window.setTimeout(() => setSaveMessage(null), 2000);
  };

  const removeSavedClip = (id: string) => {
    deleteSavedPoseClip(id);
    if (editingClipId === id) setEditingClipId(null);
    setSavedClips(listSavedPoseClips());
  };

  const openJsonFile = () => {
    fileInputRef.current?.click();
  };

  const onJsonFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Allow selecting the same file again later.
    event.target.value = "";
    if (!file) return;

    try {
      const text = await file.text();
      const result = parsePoseClipJson(text, {
        title: clipTitle || file.name.replace(/\.json$/i, ""),
        period: duration,
        modelId: selected.id,
      });
      if ("error" in result) {
        setSaveMessage(result.error);
        return;
      }
      applyClipToEditor(result.clip);
      setSaveMessage(`Opened “${result.clip.title}” from ${file.name}.`);
      window.setTimeout(() => setSaveMessage(null), 2500);
    } catch {
      setSaveMessage("Could not read that file.");
    }
  };

  const idleLab = {
    time: loopTime,
    period: duration,
    jitter,
  };

  const nearCurrent = Boolean(findKeyframeNear(keyframes, loopTime, KEYFRAME_SNAP));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Avatar pose"
        subtitle="After Effects–style timeline: scrub by seconds, drop keyframes, copy clip JSON."
      />

      <section className="overflow-hidden rounded-2xl border border-border bg-slate-100">
        <div className="border-b border-border bg-background px-4 py-4 sm:px-5">
          <div className="mb-3">
            <p className="text-sm font-semibold text-foreground">3D model</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Select a template model to adjust pose offsets live.
            </p>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="Avatar models">
            {AVATAR_MODELS.map((model) => {
              const active = model.id === selected.id;
              return (
                <li key={model.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(model.id)}
                    aria-pressed={active}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-all",
                      active
                        ? "border-orange-300 bg-orange-50 ring-2 ring-orange-500/20"
                        : "border-border bg-background hover:border-slate-300 hover:bg-slate-50",
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
                        active
                          ? "border-orange-200 bg-orange-100 text-orange-600"
                          : "border-border bg-muted text-muted-foreground",
                      )}
                    >
                      <UserCircleIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {model.label}
                        </p>
                        {active ? (
                          <CheckIcon
                            className="h-3.5 w-3.5 shrink-0 text-orange-500"
                            aria-hidden
                          />
                        ) : null}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {model.description}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div
          ref={stageRef}
          className={cn(
            "relative w-full bg-slate-100",
            isFullscreen ? "h-screen" : "h-[480px]",
          )}
        >
          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            className="absolute top-3 left-3 z-20 flex items-center justify-center rounded-lg border border-slate-200 bg-white/95 p-1.5 text-slate-700 shadow-sm backdrop-blur-sm hover:bg-white"
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            {isFullscreen ? (
              <ArrowsPointingInIcon className="h-4 w-4" aria-hidden />
            ) : (
              <ArrowsPointingOutIcon className="h-4 w-4" aria-hidden />
            )}
          </button>
          <AvatarHero
            key={selected.id}
            isTalking={false}
            mode="idle"
            modelPath={selected.modelPath}
            assistantName={selected.label}
            idlePose={displayPose}
            expressionWeights={expression}
            idleLab={idleLab}
            framing="bust"
            enableOrbit
            frameClassName="absolute inset-0 h-full w-full cursor-grab active:cursor-grabbing"
          />
          <AvatarPoseAdjustPanel
            pose={idlePose}
            onChange={onPoseChange}
            expression={expression}
            onExpressionChange={onExpressionChange}
            modelPath={selected.modelPath}
          />
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-slate-100 to-transparent"
            aria-hidden
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-6 pb-4 pr-[300px]">
            <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
              Pose lab
            </p>
            <h2 className="text-xl font-semibold text-slate-900">{selected.label}</h2>
          </div>
        </div>

        <AvatarPoseTimeline
          duration={duration}
          time={loopTime}
          playing={playing}
          jitter={jitter}
          tracks={tracks.map((track) =>
            track.id === activeTrackId
              ? { ...track, keyframes: sortedKeyframes }
              : { ...track, keyframes: sortKeyframes(track.keyframes) },
          )}
          activeTrackId={activeTrackId}
          selectedKeyframeId={selectedKeyframeId}
          nearCurrent={nearCurrent}
          clipCopied={clipCopied}
          keyframeCopied={keyframeCopied}
          canPasteKeyframe
          onPlayPause={() => setPlaying((value) => !value)}
          onScrub={onScrub}
          onSelectTrack={selectTrack}
          onAddTrack={addTrack}
          onRemoveTrack={removeTrack}
          onSelectKeyframe={selectKeyframe}
          onMoveKeyframe={moveKeyframe}
          onAddKeyframe={addOrUpdateKeyframe}
          onSaveSelected={updateSelectedKeyframe}
          onDeleteSelected={deleteSelectedKeyframe}
          onCopyKeyframe={() => void copySelectedKeyframe()}
          onPasteKeyframe={() => void pasteKeyframeAtPlayhead()}
          onCopyClip={() => void copyClipJson()}
          onClear={clearKeyframes}
          onJitterChange={setJitter}
          onDurationChange={(seconds) => {
            if (seconds !== duration) pushHistory();
            setDuration(seconds);
          }}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={undo}
          onRedo={redo}
          onMoveKeyframeEnd={() => {
            moveGestureArmedRef.current = true;
          }}
        />
      </section>

      <section className="rounded-2xl border border-border bg-background p-4 sm:p-5">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">Clip JSON</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Sync with the timeline, then save or export.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {editingClipId ? (
              <span className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-[11px] font-medium text-orange-700">
                Editing saved clip
              </span>
            ) : null}
            <span className="rounded-full border border-border bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
              {keyframes.length} kf · {tracks.length} track
              {tracks.length === 1 ? "" : "s"} · {duration}s · {selected.label}
            </span>
          </div>
        </div>

        <label className="block text-sm">
          <span className="mb-1.5 block text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Title
          </span>
          <input
            type="text"
            value={clipTitle}
            onChange={(event) => setClipTitle(event.target.value)}
            placeholder={`${selected.label} idle wave`}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/20"
          />
        </label>

        <div className="mt-4 overflow-hidden rounded-xl border border-border">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-slate-50/80 px-3 py-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 hidden text-[11px] font-medium tracking-wide text-muted-foreground uppercase sm:inline">
                Sync
              </span>
              <button
                type="button"
                onClick={syncJsonDraftFromTimeline}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground shadow-sm hover:bg-white"
                title="Write current timeline keyframes into this JSON"
              >
                <ArrowDownTrayIcon className="h-3.5 w-3.5 text-slate-500" aria-hidden />
                From timeline
              </button>
              <button
                type="button"
                onClick={applyJsonDraft}
                disabled={!jsonDraft.trim()}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground shadow-sm hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                title="Load this JSON onto the timeline and preview"
              >
                <ArrowUpTrayIcon className="h-3.5 w-3.5 text-slate-500" aria-hidden />
                To timeline
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(event) => void onJsonFileSelected(event)}
              />
              <button
                type="button"
                onClick={openJsonFile}
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-slate-100 hover:text-foreground"
              >
                <FolderOpenIcon className="h-3.5 w-3.5" aria-hidden />
                Open file
              </button>
              <button
                type="button"
                onClick={() => void copyClipJson()}
                disabled={keyframes.length === 0 && !jsonDraft.trim()}
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-slate-100 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                {clipCopied ? (
                  <CheckIcon className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                ) : (
                  <ClipboardDocumentIcon className="h-3.5 w-3.5" aria-hidden />
                )}
                {clipCopied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>

          <textarea
            ref={jsonTextareaRef}
            value={jsonDraft}
            onChange={(event) => setJsonDraft(event.target.value)}
            spellCheck={false}
            rows={14}
            placeholder={`Paste clip JSON here, e.g.\n{\n  "title": "My wave",\n  "period": 4,\n  "keyframes": [ ... ]\n}\n\nOr paste a bare idle pose object.`}
            className="block w-full resize-y border-0 bg-slate-50/40 px-3 py-3 font-mono text-xs leading-relaxed text-slate-800 outline-none focus:bg-white focus:ring-0"
          />

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background px-3 py-2.5">
            <p
              className={cn(
                "min-h-5 text-xs",
                saveMessage ? "font-medium text-orange-600" : "text-muted-foreground",
              )}
            >
              {saveMessage ??
                (jsonDraft.trim()
                  ? "Ready to apply, save, or export"
                  : "Fill from timeline or paste JSON to begin")}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={downloadClipJson}
                disabled={!jsonDraft.trim() && keyframes.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ArrowDownTrayIcon className="h-4 w-4" aria-hidden />
                Download
              </button>
              <button
                type="button"
                onClick={saveClipJson}
                disabled={!jsonDraft.trim() && keyframes.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <BookmarkSquareIcon className="h-4 w-4" aria-hidden />
                {editingClipId ? "Update clip" : "Save clip"}
              </button>
            </div>
          </div>
        </div>

        {savedClips.length > 0 ? (
          <div className="mt-5 border-t border-border pt-4">
            <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Saved clips
            </p>
            <ul className="space-y-1.5">
              {savedClips.map((clip) => (
                <li
                  key={clip.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/avatar-pose/clips/${clip.id}`}
                      className="truncate text-sm font-medium text-foreground hover:text-orange-600 hover:underline"
                    >
                      {clip.title}
                    </Link>
                    <p className="text-[11px] text-muted-foreground">
                      {clip.keyframes.length} kf · {clip.period}s
                      {clip.savedAt
                        ? ` · ${new Date(clip.savedAt).toLocaleString()}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => playSavedClip(clip)}
                      className="inline-flex items-center gap-1 rounded-md border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-700 hover:bg-orange-100"
                    >
                      <PlayIcon className="h-3.5 w-3.5" aria-hidden />
                      Play
                    </button>
                    <Link
                      href={`/avatar-pose/clips/${clip.id}`}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-slate-50"
                    >
                      <FolderOpenIcon className="h-3.5 w-3.5" aria-hidden />
                      Open
                    </Link>
                    <Link
                      href={`/avatar-pose?edit=${encodeURIComponent(clip.id)}`}
                      className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-slate-50"
                    >
                      Edit
                    </Link>
                    <button
                      type="button"
                      onClick={() => downloadPoseClipJson(clip)}
                      className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-slate-50"
                    >
                      Download
                    </button>
                    <button
                      type="button"
                      onClick={() => removeSavedClip(clip.id)}
                      className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-500 hover:text-red-600"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </div>
  );
}
