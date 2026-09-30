"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowLeftIcon,
  ArrowTopRightOnSquareIcon,
  PencilSquareIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";

import { PageHeader } from "@/components/ui-blocks";
import { Button } from "@/components/ui/button";
import {
  deleteSavedPoseClip,
  downloadPoseClipJson,
  getSavedPoseClip,
  type SavedPoseClipRecord,
} from "@/lib/avatar-pose-clip";
import { deferEffectRun } from "@/lib/defer-effect-run";

export default function AvatarPoseClipDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const clipId = params.id;
  const [clip, setClip] = useState<SavedPoseClipRecord | null>(null);
  const [ready, setReady] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    deferEffectRun(() => {
      setClip(getSavedPoseClip(clipId));
      setReady(true);
    });
  }, [clipId]);

  const jsonText = clip ? JSON.stringify(clip, null, 2) : "";

  const copyJson = async () => {
    if (!clip) return;
    try {
      await navigator.clipboard.writeText(jsonText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  const removeClip = () => {
    if (!clip) return;
    if (!window.confirm(`Delete “${clip.title}”?`)) return;
    deleteSavedPoseClip(clip.id);
    router.replace("/avatar-pose");
  };

  if (!ready) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-200 border-t-orange-500" />
      </div>
    );
  }

  if (!clip) {
    return (
      <div className="space-y-4">
        <PageHeader title="Clip not found" subtitle="This saved clip is missing or was deleted." />
        <Button asChild variant="outline">
          <Link href="/avatar-pose">
            <ArrowLeftIcon className="h-4 w-4" />
            Back to Avatar pose
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={clip.title}
        subtitle={`${clip.keyframes.length} keyframe${clip.keyframes.length === 1 ? "" : "s"} · ${clip.period}s${
          clip.modelId ? ` · ${clip.modelId}` : ""
        }${clip.savedAt ? ` · saved ${new Date(clip.savedAt).toLocaleString()}` : ""}`}
        titleAction={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/avatar-pose">
                <ArrowLeftIcon className="h-4 w-4" />
                Back
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href={`/avatar-pose?edit=${encodeURIComponent(clip.id)}`}>
                <PencilSquareIcon className="h-4 w-4" />
                Edit in pose lab
              </Link>
            </Button>
          </div>
        }
      />

      <section className="rounded-2xl border border-border bg-background p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Clip JSON</h2>
            <p className="text-xs text-muted-foreground">
              Read-only view. Use Edit in pose lab to change keyframes.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void copyJson()}>
              {copied ? "Copied" : "Copy JSON"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => downloadPoseClipJson(clip)}
            >
              <ArrowTopRightOnSquareIcon className="h-4 w-4" />
              Download
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={removeClip}>
              <TrashIcon className="h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>
        <pre className="max-h-[70vh] overflow-auto rounded-lg border border-border bg-slate-50 p-4 font-mono text-xs leading-relaxed text-slate-800 whitespace-pre-wrap">
          {jsonText}
        </pre>
      </section>
    </div>
  );
}
