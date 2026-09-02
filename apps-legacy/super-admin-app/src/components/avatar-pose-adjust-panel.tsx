"use client";

import { useMemo, useState } from "react";
import {
  DEFAULT_EXPRESSION_WEIGHTS,
  DEFAULT_IDLE_POSE_OFFSETS,
  DEFAULT_MODEL_PATH,
  cloneExpression,
  mirrorExpressionLeftToRight,
  type AvatarExpressionMorphKey,
  type AvatarExpressionWeights,
  type AvatarIdlePoseOffsets,
  type AvatarPoseBoneKey,
  type BoneOffsetDeg,
} from "@voicetalk/avatar";
import { MinusIcon, PlusIcon } from "@heroicons/react/24/outline";

type BoneKey = AvatarPoseBoneKey;

/** Head-only / non-Mixamo models — arm pose offsets have nothing to drive. */
export function modelSupportsArmPose(modelPath: string): boolean {
  const path = modelPath.split("?")[0] ?? modelPath;
  if (path === DEFAULT_MODEL_PATH) return false;
  if (/angelica/i.test(path)) return false;
  return true;
}

type PoseSection = {
  id: string;
  label: string;
  hint?: string;
  groups: Array<{ key: BoneKey; label: string }>;
};

type FaceSection = {
  id: "face";
  label: string;
  hint?: string;
  groups: Array<{
    label: string;
    morphs: Array<{ key: AvatarExpressionMorphKey; label: string }>;
  }>;
};

const POSE_SECTIONS: PoseSection[] = [
  {
    id: "body",
    label: "Body",
    hint: "Head & neck aim the face. Use Face for eyes / brows / mouth.",
    groups: [
      { key: "head", label: "Head" },
      { key: "neck", label: "Neck" },
      { key: "chest", label: "Chest" },
    ],
  },
  {
    id: "arms",
    label: "Arms",
    groups: [
      { key: "leftShoulder", label: "L Shoulder" },
      { key: "rightShoulder", label: "R Shoulder" },
      { key: "leftArm", label: "L Upper Arm" },
      { key: "rightArm", label: "R Upper Arm" },
      { key: "leftForeArm", label: "L Forearm" },
      { key: "rightForeArm", label: "R Forearm" },
      { key: "leftHand", label: "L Hand" },
      { key: "rightHand", label: "R Hand" },
    ],
  },
  {
    id: "fingers",
    label: "Fingers",
    hint: "Offsets apply along each finger chain (joints 1–3).",
    groups: [
      { key: "leftThumb", label: "L Thumb" },
      { key: "rightThumb", label: "R Thumb" },
      { key: "leftIndex", label: "L Index" },
      { key: "rightIndex", label: "R Index" },
      { key: "leftMiddle", label: "L Middle" },
      { key: "rightMiddle", label: "R Middle" },
      { key: "leftRing", label: "L Ring" },
      { key: "rightRing", label: "R Ring" },
      { key: "leftPinky", label: "L Pinky" },
      { key: "rightPinky", label: "R Pinky" },
    ],
  },
];

const FACE_SECTION: FaceSection = {
  id: "face",
  label: "Face",
  hint: "Morph weights 0–1. Missing targets on the GLB are ignored.",
  groups: [
    {
      label: "Eyes",
      morphs: [
        { key: "eyeBlinkLeft", label: "Blink L" },
        { key: "eyeBlinkRight", label: "Blink R" },
        { key: "eyesLookLeft", label: "Look L" },
        { key: "eyesLookRight", label: "Look R" },
        { key: "eyesLookUp", label: "Look up" },
        { key: "eyesLookDown", label: "Look down" },
      ],
    },
    {
      label: "Brows",
      morphs: [
        { key: "browInnerUp", label: "Inner up" },
        { key: "browDownLeft", label: "Down L" },
        { key: "browDownRight", label: "Down R" },
        { key: "browOuterUpLeft", label: "Outer L" },
        { key: "browOuterUpRight", label: "Outer R" },
      ],
    },
    {
      label: "Mouth",
      morphs: [
        { key: "jawOpen", label: "Jaw open" },
        { key: "mouthOpen", label: "Mouth open" },
        { key: "mouthSmileLeft", label: "Smile L" },
        { key: "mouthSmileRight", label: "Smile R" },
        { key: "mouthFunnel", label: "Funnel" },
        { key: "mouthPucker", label: "Pucker" },
        { key: "mouthStretchLeft", label: "Stretch L" },
        { key: "mouthStretchRight", label: "Stretch R" },
        { key: "mouthLowerDownLeft", label: "Lower L" },
        { key: "mouthLowerDownRight", label: "Lower R" },
        { key: "mouthUpperUpLeft", label: "Upper L" },
        { key: "mouthUpperUpRight", label: "Upper R" },
      ],
    },
  ],
};

const PANEL_TABS = [
  ...POSE_SECTIONS.map((s) => ({ id: s.id, label: s.label })),
  { id: FACE_SECTION.id, label: FACE_SECTION.label },
] as const;

type PanelTabId = (typeof PANEL_TABS)[number]["id"];

const MIRROR_PAIRS: Array<[BoneKey, BoneKey]> = [
  ["leftShoulder", "rightShoulder"],
  ["leftArm", "rightArm"],
  ["leftForeArm", "rightForeArm"],
  ["leftHand", "rightHand"],
  ["leftThumb", "rightThumb"],
  ["leftIndex", "rightIndex"],
  ["leftMiddle", "rightMiddle"],
  ["leftRing", "rightRing"],
  ["leftPinky", "rightPinky"],
];

const AXES: Array<keyof BoneOffsetDeg> = ["x", "y", "z"];

function clonePose(pose: AvatarIdlePoseOffsets): AvatarIdlePoseOffsets {
  const next = {} as AvatarIdlePoseOffsets;
  for (const key of Object.keys(DEFAULT_IDLE_POSE_OFFSETS) as BoneKey[]) {
    const src = pose[key] ?? DEFAULT_IDLE_POSE_OFFSETS[key];
    next[key] = { x: src.x, y: src.y, z: src.z };
  }
  return next;
}

/** Mirror left → right with Y/Z sign flip (Mixamo convention). */
function mirrorLeftToRight(pose: AvatarIdlePoseOffsets): AvatarIdlePoseOffsets {
  const next = clonePose(pose);
  for (const [left, right] of MIRROR_PAIRS) {
    next[right] = {
      x: pose[left].x,
      y: -pose[left].y,
      z: -pose[left].z,
    };
  }
  return next;
}

function BoneSliderRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid grid-cols-[28px_1fr_40px] items-center gap-2 text-[11px] text-slate-600">
      <span className="font-medium uppercase tracking-wide text-slate-400">{label}</span>
      <input
        type="range"
        min={-120}
        max={120}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1.5 w-full cursor-pointer accent-orange-500"
      />
      <input
        type="number"
        min={-180}
        max={180}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
        className="w-full rounded border border-slate-200 bg-white px-1 py-0.5 text-right font-mono text-[11px] text-slate-700"
      />
    </label>
  );
}

function MorphSliderRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const display = Math.round(value * 100) / 100;
  return (
    <label className="grid grid-cols-[64px_1fr_40px] items-center gap-2 text-[11px] text-slate-600">
      <span className="truncate font-medium text-slate-500">{label}</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1.5 w-full cursor-pointer accent-orange-500"
      />
      <input
        type="number"
        min={0}
        max={1}
        step={0.01}
        value={display}
        onChange={(event) => {
          const next = Number(event.target.value);
          onChange(Number.isFinite(next) ? Math.min(1, Math.max(0, next)) : 0);
        }}
        className="w-full rounded border border-slate-200 bg-white px-1 py-0.5 text-right font-mono text-[11px] text-slate-700"
      />
    </label>
  );
}

export function AvatarPoseAdjustPanel({
  pose,
  onChange,
  expression,
  onExpressionChange,
  modelPath,
}: {
  pose: AvatarIdlePoseOffsets;
  onChange: (pose: AvatarIdlePoseOffsets) => void;
  expression: AvatarExpressionWeights;
  onExpressionChange: (expression: AvatarExpressionWeights) => void;
  /** Current GLB path — used to detect head-only models. */
  modelPath?: string;
}) {
  const [mirror, setMirror] = useState(true);
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [sectionId, setSectionId] = useState<PanelTabId>("arms");
  const armsSupported = !modelPath || modelSupportsArmPose(modelPath);
  const isFace = sectionId === "face";

  const activePoseSection = useMemo(
    () => POSE_SECTIONS.find((section) => section.id === sectionId) ?? POSE_SECTIONS[0],
    [sectionId],
  );

  const visibleBoneGroups = useMemo(() => {
    const groups = activePoseSection.groups;
    if (!mirror) return groups;
    return groups.filter((group) => !group.key.startsWith("right"));
  }, [activePoseSection, mirror]);

  const visibleFaceGroups = useMemo(() => {
    if (!mirror) return FACE_SECTION.groups;
    return FACE_SECTION.groups.map((group) => ({
      ...group,
      morphs: group.morphs.filter((morph) => !morph.key.endsWith("Right")),
    }));
  }, [mirror]);

  const setAxis = (key: BoneKey, axis: keyof BoneOffsetDeg, value: number) => {
    let next = clonePose(pose);
    next[key] = { ...next[key], [axis]: value };
    if (mirror && key.startsWith("left")) {
      next = mirrorLeftToRight(next);
    }
    onChange(next);
  };

  const setMorph = (key: AvatarExpressionMorphKey, value: number) => {
    let next = cloneExpression(expression);
    next[key] = Math.min(1, Math.max(0, value));
    if (mirror && key.endsWith("Left")) {
      next = mirrorExpressionLeftToRight(next);
    }
    onExpressionChange(next);
  };

  const reset = () => {
    if (isFace) {
      onExpressionChange(cloneExpression(DEFAULT_EXPRESSION_WEIGHTS));
      return;
    }
    onChange(clonePose(DEFAULT_IDLE_POSE_OFFSETS));
  };

  const copyJson = async () => {
    const payload = isFace ? expression : pose;
    const json = JSON.stringify(payload, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  const hint = isFace ? FACE_SECTION.hint : activePoseSection.hint;

  if (collapsed) {
    return (
      <aside className="pointer-events-auto absolute top-3 right-3 z-20 flex items-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-2.5 py-1.5 shadow-lg backdrop-blur-sm">
        <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
          Pose adjust
        </p>
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="flex items-center justify-center rounded-md border border-slate-200 bg-white p-1 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          aria-label="Maximize pose adjust panel"
          title="Maximize"
        >
          <PlusIcon className="h-3.5 w-3.5" aria-hidden />
        </button>
      </aside>
    );
  }

  return (
    <aside className="pointer-events-auto absolute top-3 right-3 bottom-3 z-20 flex w-[280px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white/95 shadow-lg backdrop-blur-sm">
      <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-3 py-2.5">
        <div>
          <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
            Pose adjust
          </p>
          <p className="text-xs text-slate-500">
            {isFace ? "Morphs 0–1 · live" : "Degrees from bind · live"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
            <input
              type="checkbox"
              checked={mirror}
              onChange={(event) => {
                const enabled = event.target.checked;
                setMirror(enabled);
                if (enabled) {
                  onChange(mirrorLeftToRight(pose));
                  onExpressionChange(mirrorExpressionLeftToRight(expression));
                }
              }}
              className="accent-orange-500"
            />
            Mirror R
          </label>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="flex items-center justify-center rounded-md border border-slate-200 bg-white p-1 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            aria-label="Minimize pose adjust panel"
            title="Minimize"
          >
            <MinusIcon className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </div>

      <div className="flex gap-1 border-b border-slate-100 px-2 py-2">
        {PANEL_TABS.map((tab) => {
          const active = tab.id === sectionId;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSectionId(tab.id)}
              className={`flex-1 rounded-md px-1 py-1 text-[10px] font-semibold tracking-wide uppercase transition-colors ${
                active
                  ? "bg-slate-900 text-white"
                  : "bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {!armsSupported && !isFace ? (
        <div className="border-b border-amber-100 bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-900">
          This model is head-only (Angelica) — no arm bones. Switch to a Mixamo body
          model to preview idle poses. Face morphs still work here.
        </div>
      ) : null}

      {hint ? (
        <p className="border-b border-slate-100 px-3 py-2 text-[10px] leading-snug text-slate-500">
          {hint}
        </p>
      ) : null}

      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {isFace
          ? visibleFaceGroups.map((group) => (
              <div key={group.label} className="space-y-1.5 rounded-lg bg-slate-50 px-2.5 py-2">
                <p className="text-[11px] font-semibold text-slate-700">{group.label}</p>
                {group.morphs.map((morph) => (
                  <MorphSliderRow
                    key={morph.key}
                    label={morph.label}
                    value={expression[morph.key] ?? 0}
                    onChange={(value) => setMorph(morph.key, value)}
                  />
                ))}
              </div>
            ))
          : visibleBoneGroups.map((group) => (
              <div key={group.key} className="space-y-1.5 rounded-lg bg-slate-50 px-2.5 py-2">
                <p className="text-[11px] font-semibold text-slate-700">{group.label}</p>
                {AXES.map((axis) => (
                  <BoneSliderRow
                    key={axis}
                    label={axis}
                    value={pose[group.key]?.[axis] ?? 0}
                    onChange={(value) => setAxis(group.key, axis, value)}
                  />
                ))}
              </div>
            ))}
      </div>

      <div className="flex gap-2 border-t border-slate-100 px-3 py-2.5">
        <button
          type="button"
          onClick={reset}
          className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={() => void copyJson()}
          className="flex-1 rounded-lg bg-slate-900 px-2 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
        >
          {copied ? "Copied" : "Copy JSON"}
        </button>
      </div>
    </aside>
  );
}
