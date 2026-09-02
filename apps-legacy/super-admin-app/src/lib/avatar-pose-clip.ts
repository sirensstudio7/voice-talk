import {
  DEFAULT_IDLE_POSE_OFFSETS,
  cloneExpression,
  expressionHasValues,
  lerpExpression,
  maxBlendExpressions,
  type AvatarExpressionWeights,
  type AvatarIdlePoseOffsets,
  type AvatarPoseBoneKey,
} from "@voicetalk/avatar";

export type PoseKeyframe = {
  id: string;
  time: number;
  pose: AvatarIdlePoseOffsets;
  expression?: AvatarExpressionWeights;
};

/** Clip format produced by Copy / Save JSON. */
export type AvatarPoseClip = {
  version: 1;
  title: string;
  period: number;
  modelId?: string;
  keyframes: Array<{
    time: number;
    pose: AvatarIdlePoseOffsets;
    expression?: AvatarExpressionWeights;
  }>;
  savedAt?: string;
};

export function clonePose(pose: AvatarIdlePoseOffsets): AvatarIdlePoseOffsets {
  const next = {} as AvatarIdlePoseOffsets;
  for (const key of Object.keys(DEFAULT_IDLE_POSE_OFFSETS) as AvatarPoseBoneKey[]) {
    const src = pose[key] ?? DEFAULT_IDLE_POSE_OFFSETS[key];
    next[key] = { x: src.x, y: src.y, z: src.z };
  }
  return next;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

function lerpPose(
  a: AvatarIdlePoseOffsets,
  b: AvatarIdlePoseOffsets,
  t: number,
): AvatarIdlePoseOffsets {
  const u = smoothstep(t);
  const next = {} as AvatarIdlePoseOffsets;
  for (const key of Object.keys(DEFAULT_IDLE_POSE_OFFSETS) as AvatarPoseBoneKey[]) {
    next[key] = {
      x: lerp(a[key].x, b[key].x, u),
      y: lerp(a[key].y, b[key].y, u),
      z: lerp(a[key].z, b[key].z, u),
    };
  }
  return next;
}

export function sortKeyframes(keyframes: PoseKeyframe[]): PoseKeyframe[] {
  return [...keyframes].sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
}

/** Average several poses (equal weight). */
export function averagePoses(poses: AvatarIdlePoseOffsets[]): AvatarIdlePoseOffsets | null {
  if (poses.length === 0) return null;
  if (poses.length === 1) return clonePose(poses[0]);

  const next = {} as AvatarIdlePoseOffsets;
  const n = poses.length;
  for (const key of Object.keys(DEFAULT_IDLE_POSE_OFFSETS) as AvatarPoseBoneKey[]) {
    let x = 0;
    let y = 0;
    let z = 0;
    for (const pose of poses) {
      const src = pose[key] ?? DEFAULT_IDLE_POSE_OFFSETS[key];
      x += src.x;
      y += src.y;
      z += src.z;
    }
    next[key] = { x: x / n, y: y / n, z: z / n };
  }
  return next;
}

/**
 * Additive composite: start from rest, then stack each track's delta from rest.
 * Complementary layers (arms on one track, head on another) play together cleanly.
 */
export function addPoseDeltas(
  poses: AvatarIdlePoseOffsets[],
  rest: AvatarIdlePoseOffsets = DEFAULT_IDLE_POSE_OFFSETS,
): AvatarIdlePoseOffsets | null {
  if (poses.length === 0) return null;
  if (poses.length === 1) return clonePose(poses[0]);

  const next = clonePose(rest);
  for (const pose of poses) {
    for (const key of Object.keys(DEFAULT_IDLE_POSE_OFFSETS) as AvatarPoseBoneKey[]) {
      const base = rest[key] ?? DEFAULT_IDLE_POSE_OFFSETS[key];
      const src = pose[key] ?? base;
      next[key] = {
        x: next[key].x + (src.x - base.x),
        y: next[key].y + (src.y - base.y),
        z: next[key].z + (src.z - base.z),
      };
    }
  }
  return next;
}

/**
 * Sample every track with keyframes and composite them so all layers play at once.
 * - Multi-keyframe tracks: stack motion (pose@t − pose@0)
 * - Single-keyframe tracks: stack a constant offset from rest
 */
export function sampleTracksTogether(
  tracks: Array<{ keyframes: PoseKeyframe[] }>,
  time: number,
  period: number,
): AvatarIdlePoseOffsets | null {
  const active = tracks.filter((track) => track.keyframes.length > 0);
  if (active.length === 0) return null;
  if (active.length === 1) {
    return samplePoseClip(active[0].keyframes, time, period);
  }

  const rest = DEFAULT_IDLE_POSE_OFFSETS;
  const result = clonePose(rest);

  for (const track of active) {
    if (track.keyframes.length === 1) {
      const pose = track.keyframes[0].pose;
      for (const key of Object.keys(DEFAULT_IDLE_POSE_OFFSETS) as AvatarPoseBoneKey[]) {
        const r = rest[key];
        const p = pose[key] ?? r;
        result[key] = {
          x: result[key].x + (p.x - r.x),
          y: result[key].y + (p.y - r.y),
          z: result[key].z + (p.z - r.z),
        };
      }
      continue;
    }

    const base =
      samplePoseClip(track.keyframes, 0, period) ?? clonePose(track.keyframes[0].pose);
    const current = samplePoseClip(track.keyframes, time, period);
    if (!current) continue;

    for (const key of Object.keys(DEFAULT_IDLE_POSE_OFFSETS) as AvatarPoseBoneKey[]) {
      const b = base[key] ?? rest[key];
      const c = current[key] ?? b;
      result[key] = {
        x: result[key].x + (c.x - b.x),
        y: result[key].y + (c.y - b.y),
        z: result[key].z + (c.z - b.z),
      };
    }
  }

  return result;
}

/** Sample pose along a looping keyframe clip. */
export function samplePoseClip(
  keyframes: PoseKeyframe[],
  time: number,
  period: number,
): AvatarIdlePoseOffsets | null {
  if (keyframes.length === 0) return null;
  const sorted = sortKeyframes(keyframes);
  if (sorted.length === 1) return clonePose(sorted[0].pose);

  const p = Math.max(0.1, period);
  const t = ((time % p) + p) % p;

  // Build looped segment list: last → first(+period).
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    const b = sorted[(i + 1) % sorted.length];
    const aTime = a.time;
    const bTime = i + 1 < sorted.length ? b.time : b.time + p;
    const localT = t < aTime && i === sorted.length - 1 ? t + p : t;
    if (localT >= aTime && localT <= bTime) {
      const span = Math.max(0.0001, bTime - aTime);
      return lerpPose(a.pose, b.pose, (localT - aTime) / span);
    }
  }

  return clonePose(sorted[0].pose);
}

/** Sample expression weights along a looping keyframe clip. */
export function sampleExpressionClip(
  keyframes: PoseKeyframe[],
  time: number,
  period: number,
): AvatarExpressionWeights {
  if (keyframes.length === 0) return cloneExpression(null);
  const sorted = sortKeyframes(keyframes);
  if (sorted.length === 1) {
    return cloneExpression(sorted[0].expression);
  }

  const p = Math.max(0.1, period);
  const t = ((time % p) + p) % p;

  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    const b = sorted[(i + 1) % sorted.length];
    const aTime = a.time;
    const bTime = i + 1 < sorted.length ? b.time : b.time + p;
    const localT = t < aTime && i === sorted.length - 1 ? t + p : t;
    if (localT >= aTime && localT <= bTime) {
      const span = Math.max(0.0001, bTime - aTime);
      return lerpExpression(
        cloneExpression(a.expression),
        cloneExpression(b.expression),
        (localT - aTime) / span,
      );
    }
  }

  return cloneExpression(sorted[0].expression);
}

/** Max-blend expressions across every track at `time`. */
export function sampleExpressionsTogether(
  tracks: Array<{ keyframes: PoseKeyframe[] }>,
  time: number,
  period: number,
): AvatarExpressionWeights {
  const layers = tracks
    .filter((track) => track.keyframes.length > 0)
    .map((track) => sampleExpressionClip(track.keyframes, time, period));
  if (layers.length === 0) return cloneExpression(null);
  if (layers.length === 1) return layers[0];
  return maxBlendExpressions(layers);
}

export function findKeyframeNear(
  keyframes: PoseKeyframe[],
  time: number,
  tolerance = 0.05,
): PoseKeyframe | null {
  let best: PoseKeyframe | null = null;
  let bestDist = tolerance;
  for (const kf of keyframes) {
    const dist = Math.abs(kf.time - time);
    if (dist <= bestDist) {
      best = kf;
      bestDist = dist;
    }
  }
  return best;
}

export function buildPoseClip(
  keyframes: PoseKeyframe[],
  period: number,
  options?: { modelId?: string; title?: string },
): AvatarPoseClip {
  const title = options?.title?.trim() || "Untitled clip";
  return {
    version: 1,
    title,
    period,
    ...(options?.modelId ? { modelId: options.modelId } : {}),
    keyframes: sortKeyframes(keyframes).map((kf) => {
      const expression = cloneExpression(kf.expression);
      return {
        time: Number(kf.time.toFixed(3)),
        pose: clonePose(kf.pose),
        ...(expressionHasValues(expression) ? { expression } : {}),
      };
    }),
    savedAt: new Date().toISOString(),
  };
}

const SAVED_CLIPS_KEY = "lorescale_avatar_pose_clips";

export type SavedPoseClipRecord = AvatarPoseClip & { id: string };

export function listSavedPoseClips(): SavedPoseClipRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SAVED_CLIPS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedPoseClipRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getSavedPoseClip(id: string): SavedPoseClipRecord | null {
  return listSavedPoseClips().find((clip) => clip.id === id) ?? null;
}

export function savePoseClipRecord(
  clip: AvatarPoseClip,
  options?: { id?: string },
): SavedPoseClipRecord {
  const existingId = options?.id;
  const record: SavedPoseClipRecord = {
    ...clip,
    id: existingId ?? `clip_${Math.random().toString(36).slice(2, 10)}`,
    savedAt: new Date().toISOString(),
  };
  const rest = listSavedPoseClips().filter((item) => item.id !== record.id);
  const next = [record, ...rest].slice(0, 40);
  localStorage.setItem(SAVED_CLIPS_KEY, JSON.stringify(next));
  return record;
}

export function deleteSavedPoseClip(id: string): void {
  const next = listSavedPoseClips().filter((clip) => clip.id !== id);
  localStorage.setItem(SAVED_CLIPS_KEY, JSON.stringify(next));
}

export function downloadPoseClipJson(clip: AvatarPoseClip): void {
  const slug =
    clip.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "pose-clip";
  const blob = new Blob([JSON.stringify(clip, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slug}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function looksLikePose(value: unknown): value is AvatarIdlePoseOffsets {
  if (!value || typeof value !== "object") return false;
  const pose = value as Record<string, unknown>;
  return (
    typeof pose.leftArm === "object" &&
    pose.leftArm !== null &&
    typeof pose.rightArm === "object" &&
    pose.rightArm !== null
  );
}

/** Parse pasted JSON: full clip, { keyframes }, or a bare idle pose. */
export function parsePoseClipJson(
  raw: string,
  fallback?: { title?: string; period?: number; modelId?: string },
): { clip: AvatarPoseClip } | { error: string } {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { error: "Invalid JSON — check brackets and commas." };
  }

  if (!data || typeof data !== "object") {
    return { error: "JSON must be an object." };
  }

  const obj = data as Record<string, unknown>;

  // Bare pose → single keyframe clip
  if (!("keyframes" in obj) && looksLikePose(obj)) {
    return {
      clip: {
        version: 1,
        title: fallback?.title?.trim() || "Imported pose",
        period: fallback?.period ?? 4,
        ...(fallback?.modelId ? { modelId: fallback.modelId } : {}),
        keyframes: [{ time: 0, pose: clonePose(obj) }],
      },
    };
  }

  const keyframesRaw = obj.keyframes;
  if (!Array.isArray(keyframesRaw) || keyframesRaw.length === 0) {
    return { error: "JSON needs a non-empty keyframes array, or a bare pose object." };
  }

  const keyframes: AvatarPoseClip["keyframes"] = [];
  for (const entry of keyframesRaw) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as { time?: unknown; pose?: unknown; expression?: unknown };
    if (!looksLikePose(row.pose)) continue;
    const time = typeof row.time === "number" && Number.isFinite(row.time) ? row.time : 0;
    const expression =
      row.expression && typeof row.expression === "object"
        ? cloneExpression(row.expression as AvatarExpressionWeights)
        : undefined;
    keyframes.push({
      time,
      pose: clonePose(row.pose),
      ...(expression && expressionHasValues(expression) ? { expression } : {}),
    });
  }

  if (keyframes.length === 0) {
    return { error: "No valid keyframes with pose data found." };
  }

  const period =
    typeof obj.period === "number" && obj.period > 0
      ? obj.period
      : Math.max(fallback?.period ?? 4, ...keyframes.map((kf) => kf.time), 1);

  const title =
    (typeof obj.title === "string" && obj.title.trim()) ||
    fallback?.title?.trim() ||
    "Imported clip";

  return {
    clip: {
      version: 1,
      title,
      period,
      ...(typeof obj.modelId === "string"
        ? { modelId: obj.modelId }
        : fallback?.modelId
          ? { modelId: fallback.modelId }
          : {}),
      keyframes,
      ...(typeof obj.savedAt === "string" ? { savedAt: obj.savedAt } : {}),
    },
  };
}

export function newKeyframeId(): string {
  return `kf_${Math.random().toString(36).slice(2, 9)}`;
}

export type PoseTimelineTrack = {
  id: string;
  name: string;
  keyframes: PoseKeyframe[];
};

export function newTrackId(): string {
  return `track_${Math.random().toString(36).slice(2, 9)}`;
}

export function createPoseTrack(name = "Pose", keyframes: PoseKeyframe[] = []): PoseTimelineTrack {
  return { id: newTrackId(), name, keyframes };
}

/** Single-keyframe clipboard payload (Copy / Paste on the timeline). */
export type PoseKeyframeClipboard = {
  type: "voicetalk.avatar-pose-keyframe";
  version: 1;
  pose: AvatarIdlePoseOffsets;
  expression?: AvatarExpressionWeights;
  sourceTime?: number;
};

export function buildKeyframeClipboard(
  pose: AvatarIdlePoseOffsets,
  sourceTime?: number,
  expression?: AvatarExpressionWeights,
): PoseKeyframeClipboard {
  const expr = cloneExpression(expression);
  return {
    type: "voicetalk.avatar-pose-keyframe",
    version: 1,
    pose: clonePose(pose),
    ...(expressionHasValues(expr) ? { expression: expr } : {}),
    ...(typeof sourceTime === "number" ? { sourceTime } : {}),
  };
}

export function parseKeyframeClipboard(raw: string): PoseKeyframeClipboard | null {
  try {
    const data = JSON.parse(raw) as Partial<PoseKeyframeClipboard> & {
      pose?: AvatarIdlePoseOffsets;
      expression?: AvatarExpressionWeights;
    };
    if (!data || typeof data !== "object" || !data.pose) return null;
    // Accept our typed payload, or a bare pose / { time, pose } object.
    if (
      data.type === "voicetalk.avatar-pose-keyframe" ||
      data.type === undefined ||
      ("leftArm" in data.pose && "rightArm" in data.pose)
    ) {
      const expression = data.expression ? cloneExpression(data.expression) : undefined;
      return {
        type: "voicetalk.avatar-pose-keyframe",
        version: 1,
        pose: clonePose(data.pose),
        ...(expression && expressionHasValues(expression) ? { expression } : {}),
        ...(typeof data.sourceTime === "number" ? { sourceTime: data.sourceTime } : {}),
      };
    }
    return null;
  } catch {
    return null;
  }
}
