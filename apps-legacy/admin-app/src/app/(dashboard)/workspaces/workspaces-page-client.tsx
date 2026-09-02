"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowTopRightOnSquareIcon,
  BuildingOffice2Icon,
  CheckIcon,
  ExclamationTriangleIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";

import { PageHeader } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { api, ApiRequestError, type Business } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { customerAppUrl } from "@/lib/customer-app";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function resolveMediaUrl(path: string): string {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("data:")) {
    return path;
  }
  if (path.startsWith("/")) return `${API_URL}${path}`;
  return path;
}

export function WorkspacesPageClient() {
  const router = useRouter();
  const { token, businesses, business, refreshBusinesses } = useAuth();
  const [canCreate, setCanCreate] = useState(true);
  const [usage, setUsage] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Business | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const nameMatches =
    !!pendingDelete && confirmName.trim() === pendingDelete.name.trim();
  const isLastWorkspace = businesses.length === 1;

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void api
      .getSubscription(token)
      .then((sub) => {
        if (cancelled) return;
        setCanCreate(sub.can_create_workspace);
        setUsage(`${sub.workspace_count} / ${sub.workspace_limit}`);
      })
      .catch(() => {
        if (!cancelled) {
          setCanCreate(true);
          setUsage(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, businesses.length]);

  const closeDeleteModal = () => {
    if (deleting) return;
    setPendingDelete(null);
    setConfirmName("");
    setDeleteError(null);
  };

  const confirmDelete = async () => {
    if (!token || !pendingDelete || !nameMatches) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deleteBusiness(token, pendingDelete.id);
      const list = await refreshBusinesses({ silent: true });
      setPendingDelete(null);
      setConfirmName("");
      if (list.length === 0) {
        router.replace("/onboarding/workspace");
      }
    } catch (error) {
      const message =
        error instanceof ApiRequestError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Could not delete workspace.";
      setDeleteError(message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Workspaces"
        subtitle={
          usage
            ? `Manage your workspaces. Usage: ${usage}`
            : "Manage your workspaces or create a new one."
        }
        action={
          <Button
            onClick={() => {
              if (canCreate) {
                router.push("/onboarding/workspace?new=1");
              } else {
                router.push("/billing");
              }
            }}
          >
            <PlusIcon />
            {canCreate ? "New workspace" : "Upgrade plan"}
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {businesses.map((item) => {
          const selected = item.id === business?.id;
          const thumb = item.background_url?.trim() || "";
          const resolvedThumb = thumb ? resolveMediaUrl(thumb) : "";
          return (
            <article
              key={item.id}
              className={cn(
                "group flex flex-col overflow-hidden rounded-2xl bg-white ring-1 transition",
                selected
                  ? "ring-orange-300 ring-2"
                  : "ring-slate-200/80",
              )}
            >
              <div className="px-1 pt-1">
                <div className="relative aspect-[7/6] w-full overflow-hidden rounded-xl bg-slate-100">
                  {resolvedThumb ? (
                    <Image
                      src={resolvedThumb}
                      alt={item.name}
                      fill
                      unoptimized
                      sizes="(max-width: 640px) 50vw, (max-width: 1280px) 33vw, 25vw"
                      className="object-cover transition duration-300 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-gradient-to-br from-orange-50 via-amber-50 to-orange-100">
                      <BuildingOffice2Icon className="h-10 w-10 text-orange-300" />
                    </div>
                  )}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/10 to-transparent" />
                  {selected ? (
                    <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full border border-white/40 bg-white/95 px-2 py-0.5 text-[11px] font-medium text-slate-900 shadow-sm backdrop-blur">
                      <CheckIcon className="size-3.5 text-orange-500" />
                      Active
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-1 flex-col gap-2 p-3.5">
                <div className="min-h-0 flex-1">
                  <p className="line-clamp-1 text-base font-semibold leading-tight tracking-tight text-slate-900">
                    {item.name}
                  </p>
                  <p className="mt-1 line-clamp-2 text-sm leading-snug text-slate-500">
                    {item.tagline || "No tagline yet"}
                  </p>
                </div>

                <div className="mt-auto flex items-center justify-between gap-2 pt-0.5">
                  <p className="truncate text-xs font-medium text-slate-500">/{item.slug}</p>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <a
                      href={customerAppUrl(item.slug)}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open customer app for ${item.name}`}
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 active:scale-95"
                    >
                      <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                    </a>
                    <button
                      type="button"
                      aria-label={`Delete ${item.name}`}
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 active:scale-95"
                      onClick={() => {
                        setDeleteError(null);
                        setConfirmName("");
                        setPendingDelete(item);
                      }}
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </article>
          );
        })}

        <button
          type="button"
          onClick={() => {
            if (canCreate) {
              router.push("/onboarding/workspace?new=1");
            } else {
              router.push("/billing");
            }
          }}
          className="flex min-h-[12rem] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-center text-sm text-slate-500 transition-colors hover:border-orange-300 hover:bg-orange-50/40 hover:text-slate-700"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50">
            <PlusIcon className="h-5 w-5" />
          </div>
          <span className="font-medium">
            {canCreate ? "Create new workspace" : "Upgrade to add a workspace"}
          </span>
        </button>
      </div>

      {pendingDelete ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-workspace-title"
          onClick={closeDeleteModal}
        >
          <div
            className="w-full max-w-md rounded-xl border border-border bg-background p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="delete-workspace-title" className="text-lg font-semibold text-foreground">
              Delete workspace?
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This will permanently delete{" "}
              <span className="font-medium text-foreground">{pendingDelete.name}</span> and all of
              its products, conversations, orders, and settings. This cannot be undone.
            </p>
            {isLastWorkspace ? (
              <div
                className="mt-4 overflow-hidden rounded-xl border border-slate-200/80 bg-gradient-to-br from-slate-50 to-white shadow-sm"
                role="note"
              >
                <div className="flex gap-3 p-3.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-500/10 text-orange-600 ring-1 ring-orange-500/15">
                    <ExclamationTriangleIcon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-semibold tracking-tight text-slate-900">
                      This is your only workspace
                    </p>
                    <p className="text-sm leading-relaxed text-slate-600">
                      You&apos;ll stay signed in, but everything in this workspace will be removed.
                      Setting up again starts from scratch.
                    </p>
                  </div>
                </div>
                <div className="space-y-1.5 border-t border-slate-200/70 bg-white/70 px-3.5 py-3">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    What happens next
                  </p>
                  <ul className="space-y-1 text-xs leading-relaxed text-slate-600">
                    <li className="flex gap-2">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-orange-400" />
                      Create a new workspace and choose business industry again
                    </li>
                    <li className="flex gap-2">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-orange-400" />
                      Your account email and plan are not deleted
                    </li>
                  </ul>
                </div>
              </div>
            ) : null}
            <div className="mt-4 flex flex-col gap-2.5">
              <label
                htmlFor="confirm-workspace-name"
                className="text-sm leading-snug text-muted-foreground"
              >
                Type <span className="font-medium text-foreground">{pendingDelete.name}</span> to
                confirm
              </label>
              <input
                id="confirm-workspace-name"
                type="text"
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                disabled={deleting}
                autoFocus
                autoComplete="off"
                placeholder={pendingDelete.name}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            {deleteError ? (
              <p className="mt-3 text-sm text-destructive" role="alert">
                {deleteError}
              </p>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={deleting}
                onClick={closeDeleteModal}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={deleting || !nameMatches}
                className="bg-destructive text-white hover:bg-destructive/90"
                onClick={() => void confirmDelete()}
              >
                {deleting ? "Deleting…" : "Delete workspace"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
