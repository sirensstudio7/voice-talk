"use client";

import {
  ArrowTopRightOnSquareIcon,
  CheckIcon,
  ClipboardDocumentIcon,
  ComputerDesktopIcon,
  EllipsisHorizontalIcon,
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { PageHeader } from "@/components/ui";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api, type KioskDisplay } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { customerAppUrl } from "@/lib/customer-app";
import { deferEffectRun } from "@/lib/defer-effect-run";

export function KiosksPageClient() {
  const router = useRouter();
  const { token, business } = useAuth();
  const [items, setItems] = useState<KioskDisplay[]>([]);
  const [limit, setLimit] = useState(1);
  const [canCreate, setCanCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [creating, setCreating] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [pinId, setPinId] = useState<string | null>(null);
  const [pinValue, setPinValue] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!token || !business) return;
    if (!silent) setLoading(true);
    try {
      const list = await api.listKiosks(token, business.id);
      setItems(list.items);
      setLimit(list.limit);
      setCanCreate(list.can_create);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load kiosks");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [token, business]);

  useEffect(() => {
    deferEffectRun(() => void load(false));
  }, [load]);

  useEffect(() => {
    if (!token || !business) return;
    const interval = window.setInterval(() => {
      void load(true);
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [token, business, load]);

  async function copyLink(display: KioskDisplay) {
    if (!business) return;
    const url = customerAppUrl(business.slug, display.slug);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(display.id);
      setSuccess(`Copied link for ${display.name}.`);
      window.setTimeout(() => {
        setCopiedId((current) => (current === display.id ? null : current));
      }, 2000);
    } catch {
      setError("Could not copy the link.");
    }
  }

  async function createDisplay(event: React.FormEvent) {
    event.preventDefault();
    if (!token || !business) return;
    setCreating(true);
    setError(null);
    setSuccess(null);
    try {
      await api.createKiosk(token, business.id, { name: name.trim() || "Kiosk display", pin });
      setName("");
      setPin("");
      setSuccess("Kiosk display created.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create display");
    } finally {
      setCreating(false);
    }
  }

  async function saveRename(display: KioskDisplay) {
    if (!token || !business) return;
    setBusyId(display.id);
    try {
      await api.updateKiosk(token, business.id, display.id, { name: renameValue });
      setRenameId(null);
      setSuccess("Display renamed.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rename display");
    } finally {
      setBusyId(null);
    }
  }

  async function savePin(display: KioskDisplay) {
    if (!token || !business) return;
    setBusyId(display.id);
    try {
      await api.updateKiosk(token, business.id, display.id, { pin: pinValue });
      setPinId(null);
      setPinValue("");
      setSuccess("PIN updated.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update PIN");
    } finally {
      setBusyId(null);
    }
  }

  async function removeDisplay(display: KioskDisplay) {
    if (!token || !business) return;
    if (!window.confirm(`Delete ${display.name}? Tablets using this link will stop unlocking.`)) {
      return;
    }
    setBusyId(display.id);
    try {
      await api.deleteKiosk(token, business.id, display.id);
      setSuccess("Display deleted.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete display");
    } finally {
      setBusyId(null);
    }
  }

  function startRename(display: KioskDisplay) {
    setRenameId(display.id);
    setRenameValue(display.name);
    setPinId(null);
  }

  function startPinEdit(display: KioskDisplay) {
    setPinId(display.id);
    setPinValue("");
    setRenameId(null);
  }

  async function releaseDisplay(display: KioskDisplay) {
    if (!token || !business) return;
    if (
      !window.confirm(
        `Release ${display.name}? Another tablet can unlock with the PIN. The current session will stop.`,
      )
    ) {
      return;
    }
    setBusyId(display.id);
    try {
      await api.releaseKiosk(token, business.id, display.id);
      setSuccess(`${display.name} is available for a new unlock.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not release display");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Kiosks"
        subtitle={`Named tablet displays for this workspace. Your plan allows ${limit} display${limit === 1 ? "" : "s"}. Each one has its own PIN.`}
        action={
          !loading && !canCreate ? (
            <Button type="button" onClick={() => router.push("/billing")}>
              Upgrade plan
            </Button>
          ) : undefined
        }
      />

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-400" role="status">
          {success}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading kiosks…</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((display) => (
            <KioskDisplayCard
              key={display.id}
              display={display}
              kioskUrl={business ? customerAppUrl(business.slug, display.slug) : ""}
              copied={copiedId === display.id}
              busy={busyId === display.id}
              renaming={renameId === display.id}
              renameValue={renameValue}
              editingPin={pinId === display.id}
              pinValue={pinValue}
              onCopy={() => void copyLink(display)}
              onOpen={() => {
                if (!business) return;
                window.open(customerAppUrl(business.slug, display.slug), "_blank", "noopener,noreferrer");
              }}
              onStartRename={() => startRename(display)}
              onRenameValueChange={setRenameValue}
              onSaveRename={() => void saveRename(display)}
              onCancelRename={() => setRenameId(null)}
              onStartPinEdit={() => startPinEdit(display)}
              onPinValueChange={setPinValue}
              onSavePin={() => void savePin(display)}
              onCancelPin={() => {
                setPinId(null);
                setPinValue("");
              }}
              onDelete={() => void removeDisplay(display)}
              onRelease={() => void releaseDisplay(display)}
            />
          ))}

          {canCreate ? (
            <form
              onSubmit={(event) => void createDisplay(event)}
              className="flex flex-col gap-3 rounded-2xl border border-dashed border-slate-300 bg-white p-3.5"
            >
              <div>
                <p className="text-sm font-semibold text-slate-900">Add a display</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {Math.max(0, limit - items.length)} left on this plan
                </p>
              </div>
              <label className="grid gap-1 text-xs text-slate-500">
                Name
                <input
                  className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-900"
                  placeholder="Front desk"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label className="grid gap-1 text-xs text-slate-500">
                PIN
                <input
                  className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 font-mono text-sm tracking-widest text-slate-900"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="6 digits"
                  value={pin}
                  onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
                />
              </label>
              <Button type="submit" size="sm" className="mt-auto w-full" disabled={creating || pin.length !== 6}>
                {creating ? "Adding…" : "Add display"}
              </Button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => router.push("/billing")}
              className="flex min-h-44 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-center text-sm text-slate-500 transition-colors hover:border-orange-300 hover:bg-orange-50/40 hover:text-slate-700"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50">
                <PlusIcon className="h-5 w-5" />
              </div>
              <span className="font-medium">Upgrade plan</span>
              <span className="text-xs">Plan includes {limit}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

type KioskDisplayCardProps = {
  display: KioskDisplay;
  kioskUrl: string;
  copied: boolean;
  busy: boolean;
  renaming: boolean;
  renameValue: string;
  editingPin: boolean;
  pinValue: string;
  onCopy: () => void;
  onOpen: () => void;
  onStartRename: () => void;
  onRenameValueChange: (value: string) => void;
  onSaveRename: () => void;
  onCancelRename: () => void;
  onStartPinEdit: () => void;
  onPinValueChange: (value: string) => void;
  onSavePin: () => void;
  onCancelPin: () => void;
  onDelete: () => void;
  onRelease: () => void;
};

function shortKioskPath(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 active:scale-95"
    >
      {children}
    </button>
  );
}

function KioskDisplayCard({
  display,
  kioskUrl,
  copied,
  busy,
  renaming,
  renameValue,
  editingPin,
  pinValue,
  onCopy,
  onOpen,
  onStartRename,
  onRenameValueChange,
  onSaveRename,
  onCancelRename,
  onStartPinEdit,
  onPinValueChange,
  onSavePin,
  onCancelPin,
  onDelete,
  onRelease,
}: KioskDisplayCardProps) {
  const needsPin = !display.pin_set;
  const lockedByPlan = !display.unlockable;
  const statusLabel = lockedByPlan
    ? "Over limit"
    : display.in_use
      ? "In use"
      : needsPin
        ? "Needs PIN"
        : "Available";

  return (
    <article
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl bg-white ring-1",
        lockedByPlan ? "ring-red-200" : "ring-slate-200/80",
      )}
    >
      <div className="px-1 pt-1">
        <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-slate-100">
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-orange-50 via-amber-50 to-orange-100">
            <ComputerDesktopIcon className="h-9 w-9 text-orange-300" aria-hidden />
          </div>
          <span
            className={cn(
              "absolute right-2 top-2 rounded-full border border-white/40 bg-white/95 px-2 py-0.5 text-[11px] font-medium shadow-sm",
              display.in_use ? "text-orange-700" : "text-slate-900",
            )}
          >
            {statusLabel}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <div>
          <p className="line-clamp-1 text-base font-semibold leading-tight tracking-tight text-slate-900">
            {display.name}
          </p>
          <p className="mt-1 text-sm leading-snug text-slate-500">
            {display.is_default ? "Default display" : "Extra display"}
            {lockedByPlan ? " · locked" : display.in_use ? " · session active" : needsPin ? " · no PIN" : " · ready"}
          </p>
        </div>

        <div className="mt-auto flex flex-col gap-2 pt-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-xs font-medium text-slate-500" title={kioskUrl}>
              {kioskUrl ? shortKioskPath(kioskUrl) : "—"}
            </p>
            <div className="flex shrink-0 items-center gap-1.5">
              <IconButton label={copied ? "Copied" : "Copy link"} onClick={onCopy}>
                {copied ? (
                  <CheckIcon className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <ClipboardDocumentIcon className="h-3.5 w-3.5" />
                )}
              </IconButton>
              <IconButton label="Open kiosk" onClick={onOpen}>
                <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
              </IconButton>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="More actions"
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 active:scale-95"
                  >
                    <EllipsisHorizontalIcon className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem onSelect={onStartRename}>
                    <PencilSquareIcon />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={onStartPinEdit}>
                    {display.pin_set ? "Change PIN" : "Set PIN"}
                  </DropdownMenuItem>
                  {display.pin_set && display.unlockable ? (
                    <DropdownMenuItem onSelect={onRelease}>End session</DropdownMenuItem>
                  ) : null}
                  {!display.is_default ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                        disabled={busy}
                        onSelect={onDelete}
                      >
                        <TrashIcon />
                        Delete
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {display.pin_set && display.unlockable && !renaming && !editingPin ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(
                "w-full",
                display.in_use
                  ? "border-orange-200 text-orange-800 hover:bg-orange-50"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50",
              )}
              disabled={busy}
              onClick={onRelease}
            >
              {display.in_use ? "End session" : "Clear session"}
            </Button>
          ) : null}
        </div>

        {renaming ? (
          <form
            className="mt-1 grid gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              onSaveRename();
            }}
          >
            <input
              className="h-8 rounded-lg border border-slate-200 px-2.5 text-sm"
              value={renameValue}
              autoFocus
              aria-label="Display name"
              onChange={(event) => onRenameValueChange(event.target.value)}
            />
            <div className="flex justify-end gap-1.5">
              <Button type="button" variant="ghost" size="sm" onClick={onCancelRename}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={busy || !renameValue.trim()}>
                Save
              </Button>
            </div>
          </form>
        ) : null}

        {editingPin ? (
          <form
            className="mt-1 grid gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              onSavePin();
            }}
          >
            <input
              className="h-8 rounded-lg border border-slate-200 px-2.5 font-mono text-sm tracking-[0.2em]"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              placeholder="000000"
              aria-label="PIN"
              value={pinValue}
              onChange={(event) => onPinValueChange(event.target.value.replace(/\D/g, "").slice(0, 6))}
            />
            <div className="flex justify-end gap-1.5">
              <Button type="button" variant="ghost" size="sm" onClick={onCancelPin}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={busy || pinValue.length !== 6}>
                Save
              </Button>
            </div>
          </form>
        ) : null}

        {needsPin && !editingPin && !renaming ? (
          <Button type="button" size="sm" className="mt-1 w-full" onClick={onStartPinEdit}>
            Set PIN
          </Button>
        ) : null}
      </div>
    </article>
  );
}
