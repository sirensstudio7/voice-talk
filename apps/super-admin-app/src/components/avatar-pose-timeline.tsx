"use client";

import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from "react";
import {
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  ClipboardDocumentIcon,
  ClipboardDocumentCheckIcon,
  DocumentDuplicateIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";

import type { PoseKeyframe, PoseTimelineTrack } from "@/lib/avatar-pose-clip";
import { cn } from "@/lib/cn";

type AvatarPoseTimelineProps = {
  duration: number;
  time: number;
  playing: boolean;
  jitter: number;
  tracks: PoseTimelineTrack[];
  activeTrackId: string;
  selectedKeyframeId: string | null;
  nearCurrent: boolean;
  clipCopied: boolean;
  keyframeCopied: boolean;
  canPasteKeyframe: boolean;
  onPlayPause: () => void;
  onScrub: (time: number) => void;
  onSelectTrack: (trackId: string) => void;
  onAddTrack: () => void;
  onRemoveTrack: (trackId: string) => void;
  onSelectKeyframe: (kf: PoseKeyframe) => void;
  onMoveKeyframe: (id: string, time: number) => void;
  onAddKeyframe: () => void;
  onSaveSelected: () => void;
  onDeleteSelected: () => void;
  onCopyKeyframe: () => void;
  onPasteKeyframe: () => void;
  onCopyClip: () => void;
  onClear: () => void;
  onJitterChange: (value: number) => void;
  onDurationChange: (seconds: number) => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onMoveKeyframeEnd?: () => void;
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function formatTimecode(seconds: number): string {
  const s = Math.max(0, seconds);
  const whole = Math.floor(s);
  const frames = Math.floor((s - whole) * 30); // 30fps display
  const mins = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}:${String(frames).padStart(2, "0")}`;
}

export function AvatarPoseTimeline({
  duration,
  time,
  playing,
  jitter,
  tracks,
  activeTrackId,
  selectedKeyframeId,
  nearCurrent,
  clipCopied,
  keyframeCopied,
  canPasteKeyframe,
  onPlayPause,
  onScrub,
  onSelectTrack,
  onAddTrack,
  onRemoveTrack,
  onSelectKeyframe,
  onMoveKeyframe,
  onAddKeyframe,
  onSaveSelected,
  onDeleteSelected,
  onCopyKeyframe,
  onPasteKeyframe,
  onCopyClip,
  onClear,
  onJitterChange,
  onDurationChange,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  onMoveKeyframeEnd,
}: AvatarPoseTimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingPlayhead = useRef(false);
  const draggingKeyframeId = useRef<string | null>(null);

  const activeTrack = tracks.find((track) => track.id === activeTrackId) ?? tracks[0];
  const activeKeyframes = activeTrack?.keyframes ?? [];

  const timeFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      const ratio = clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1);
      return Number((ratio * duration).toFixed(3));
    },
    [duration],
  );

  const onTrackPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).dataset.keyframe === "1") return;
    draggingPlayhead.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    onScrub(timeFromClientX(event.clientX));
  };

  const onTrackPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (draggingKeyframeId.current) {
      onMoveKeyframe(draggingKeyframeId.current, timeFromClientX(event.clientX));
      return;
    }
    if (!draggingPlayhead.current) return;
    onScrub(timeFromClientX(event.clientX));
  };

  const onTrackPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const wasDraggingKeyframe = Boolean(draggingKeyframeId.current);
    draggingPlayhead.current = false;
    draggingKeyframeId.current = null;
    if (wasDraggingKeyframe) onMoveKeyframeEnd?.();
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }
  };

  const secondMarks = Array.from({ length: Math.floor(duration) + 1 }, (_, i) => i);
  const playheadPct = duration > 0 ? (time / duration) * 100 : 0;

  return (
    <div className="border-t border-border bg-[#1a1d23] text-slate-200">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2">
        <button
          type="button"
          onClick={onPlayPause}
          className="flex h-8 w-8 items-center justify-center rounded-md bg-white/10 text-white hover:bg-white/15"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? (
            <PauseIcon className="h-4 w-4" aria-hidden />
          ) : (
            <PlayIcon className="h-4 w-4" aria-hidden />
          )}
        </button>

        <div className="rounded-md bg-black/40 px-2.5 py-1 font-mono text-xs tabular-nums text-orange-300 ring-1 ring-white/10">
          {formatTimecode(time)}
          <span className="text-slate-500"> / </span>
          {formatTimecode(duration)}
        </div>

        <label className="ml-1 flex items-center gap-1.5 text-[11px] text-slate-400">
          Duration
          <select
            value={duration}
            onChange={(event) => onDurationChange(Number(event.target.value))}
            className="rounded border border-white/10 bg-black/30 px-1.5 py-1 text-xs text-slate-200"
          >
            {[2, 3, 4, 5, 6, 8, 10, 12].map((sec) => (
              <option key={sec} value={sec}>
                {sec}s
              </option>
            ))}
          </select>
        </label>

        <div className="mx-1 h-4 w-px bg-white/10" />

        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo || !onUndo}
          className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2.5 py-1.5 text-[11px] font-medium text-slate-200 hover:bg-white/5 disabled:opacity-40"
          title="Undo (⌘/Ctrl+Z)"
        >
          <ArrowUturnLeftIcon className="h-3.5 w-3.5" aria-hidden />
          Undo
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo || !onRedo}
          className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2.5 py-1.5 text-[11px] font-medium text-slate-200 hover:bg-white/5 disabled:opacity-40"
          title="Redo (⌘/Ctrl+Shift+Z)"
        >
          <ArrowUturnRightIcon className="h-3.5 w-3.5" aria-hidden />
          Redo
        </button>

        <div className="mx-1 h-4 w-px bg-white/10" />

        <button
          type="button"
          onClick={onAddKeyframe}
          className="inline-flex items-center gap-1 rounded-md bg-orange-500/90 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-orange-500"
        >
          <PlusIcon className="h-3.5 w-3.5" aria-hidden />
          {nearCurrent ? "Update keyframe" : "Add keyframe"}
        </button>
        <button
          type="button"
          onClick={onSaveSelected}
          disabled={!selectedKeyframeId}
          className="rounded-md border border-white/10 px-2.5 py-1.5 text-[11px] font-medium text-slate-200 hover:bg-white/5 disabled:opacity-40"
        >
          Save selected
        </button>
        <button
          type="button"
          onClick={onDeleteSelected}
          disabled={!selectedKeyframeId}
          className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2.5 py-1.5 text-[11px] font-medium text-slate-200 hover:bg-white/5 disabled:opacity-40"
        >
          <TrashIcon className="h-3.5 w-3.5" aria-hidden />
          Delete
        </button>
        <button
          type="button"
          onClick={onCopyKeyframe}
          disabled={!selectedKeyframeId}
          className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2.5 py-1.5 text-[11px] font-medium text-slate-200 hover:bg-white/5 disabled:opacity-40"
          title="Copy selected keyframe (⌘/Ctrl+C)"
        >
          {keyframeCopied ? (
            <ClipboardDocumentCheckIcon className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <ClipboardDocumentIcon className="h-3.5 w-3.5" aria-hidden />
          )}
          {keyframeCopied ? "Copied kf" : "Copy kf"}
        </button>
        <button
          type="button"
          onClick={onPasteKeyframe}
          disabled={!canPasteKeyframe}
          className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2.5 py-1.5 text-[11px] font-medium text-slate-200 hover:bg-white/5 disabled:opacity-40"
          title="Paste keyframe at playhead (⌘/Ctrl+V)"
        >
          Paste kf
        </button>
        <button
          type="button"
          onClick={onCopyClip}
          disabled={activeKeyframes.length === 0}
          className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2.5 py-1.5 text-[11px] font-medium text-slate-200 hover:bg-white/5 disabled:opacity-40"
        >
          <DocumentDuplicateIcon className="h-3.5 w-3.5" aria-hidden />
          {clipCopied ? "Copied" : "Copy clip JSON"}
        </button>
        {activeKeyframes.length > 0 ? (
          <button
            type="button"
            onClick={onClear}
            className="text-[11px] text-slate-500 hover:text-slate-300"
          >
            Clear
          </button>
        ) : null}

        <label className="ml-auto flex items-center gap-2 text-[11px] text-slate-400">
          Jitter
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={jitter}
            onChange={(event) => onJitterChange(Number(event.target.value))}
            className="h-1.5 w-24 cursor-pointer accent-orange-500"
          />
          <span className="w-8 font-mono tabular-nums text-slate-500">
            {Math.round(jitter * 100)}%
          </span>
        </label>
      </div>

      <div className="grid grid-cols-[88px_1fr]">
        <div className="border-r border-white/10 bg-black/20">
          <div className="flex h-7 items-end px-2 pb-1 text-[10px] font-medium tracking-wide text-slate-500 uppercase">
            Time
          </div>
          {tracks.map((track) => {
            const active = track.id === activeTrackId;
            return (
              <div
                key={track.id}
                className={cn(
                  "group flex h-10 items-center gap-1 border-t border-white/5 px-1.5",
                  active ? "bg-orange-500/10" : "hover:bg-white/5",
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelectTrack(track.id)}
                  className={cn(
                    "min-w-0 flex-1 truncate rounded px-1 py-1 text-left text-[11px] font-medium",
                    active ? "text-orange-200" : "text-slate-300",
                  )}
                  title={track.name}
                >
                  {track.name}
                </button>
                {tracks.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => onRemoveTrack(track.id)}
                    className="rounded p-0.5 text-slate-600 opacity-0 hover:bg-white/10 hover:text-red-300 group-hover:opacity-100"
                    aria-label={`Remove ${track.name}`}
                    title="Remove track"
                  >
                    <TrashIcon className="h-3 w-3" aria-hidden />
                  </button>
                ) : null}
              </div>
            );
          })}
          <div className="border-t border-white/5 p-1.5">
            <button
              type="button"
              onClick={onAddTrack}
              className="inline-flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-white/15 px-1.5 py-1.5 text-[10px] font-medium text-slate-400 hover:border-orange-400/40 hover:bg-orange-500/10 hover:text-orange-200"
            >
              <PlusIcon className="h-3 w-3" aria-hidden />
              Track
            </button>
          </div>
        </div>

        <div
          ref={trackRef}
          className="relative select-none touch-none"
          onPointerDown={onTrackPointerDown}
          onPointerMove={onTrackPointerMove}
          onPointerUp={onTrackPointerUp}
          onPointerCancel={onTrackPointerUp}
        >
          {/* Ruler — second-by-second */}
          <div className="relative h-7 border-b border-white/10 bg-[#12151a]">
            {secondMarks.map((sec) => (
              <div
                key={sec}
                className="absolute top-0 bottom-0 border-l border-white/20"
                style={{ left: `${(sec / duration) * 100}%` }}
              >
                <span className="absolute top-1 left-1 font-mono text-[10px] tabular-nums text-slate-400">
                  {sec}s
                </span>
              </div>
            ))}
            {Array.from({ length: Math.floor(duration * 4) + 1 }, (_, i) => i).map((q) => {
              if (q % 4 === 0) return null;
              const sec = q / 4;
              return (
                <div
                  key={`q-${q}`}
                  className="absolute top-0 h-2 border-l border-white/10"
                  style={{ left: `${(sec / duration) * 100}%` }}
                />
              );
            })}
          </div>

          {tracks.map((track) => {
            const active = track.id === activeTrackId;
            return (
              <div
                key={track.id}
                className={cn(
                  "relative h-10 border-t border-white/5",
                  active ? "bg-[#1c222c]" : "bg-[#161a21]",
                )}
                onPointerDown={() => {
                  if (!active) onSelectTrack(track.id);
                }}
              >
                <div
                  className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/10"
                  aria-hidden
                />
                {track.keyframes.map((kf) => {
                  const selected = active && kf.id === selectedKeyframeId;
                  return (
                    <button
                      key={kf.id}
                      type="button"
                      data-keyframe="1"
                      title={`${track.name} · ${kf.time.toFixed(2)}s`}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        if (!active) onSelectTrack(track.id);
                        draggingKeyframeId.current = kf.id;
                        onSelectKeyframe(kf);
                        event.currentTarget.setPointerCapture(event.pointerId);
                      }}
                      className={cn(
                        "absolute top-1/2 z-10 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border shadow",
                        selected
                          ? "border-orange-200 bg-orange-400"
                          : active
                            ? "border-sky-200 bg-sky-400 hover:bg-sky-300"
                            : "border-slate-400 bg-slate-500/80 hover:bg-slate-400",
                      )}
                      style={{ left: `${(kf.time / duration) * 100}%` }}
                    />
                  );
                })}
              </div>
            );
          })}

          {/* Spacer row aligned with Add track button */}
          <div className="h-[37px] border-t border-white/5 bg-[#12151a]" />

          {/* Playhead */}
          <div
            className="pointer-events-none absolute inset-y-0 z-20 w-px bg-orange-400"
            style={{ left: `${playheadPct}%` }}
          >
            <div className="absolute -top-0 left-1/2 h-0 w-0 -translate-x-1/2 border-x-[5px] border-t-[8px] border-x-transparent border-t-orange-400" />
          </div>
        </div>
      </div>

      <p className="border-t border-white/10 px-3 py-1.5 text-[10px] text-slate-500">
        {playing
          ? `Playing all ${tracks.filter((t) => t.keyframes.length > 0).length || tracks.length} track(s) together`
          : "Play runs every track together · click a track to edit (won’t stop playback) · drag diamonds to move keyframes."}
      </p>
    </div>
  );
}
