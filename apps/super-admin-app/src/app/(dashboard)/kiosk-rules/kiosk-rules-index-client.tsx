"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  CalendarDaysIcon,
  ChatBubbleLeftRightIcon,
  ClockIcon,
  PlusIcon,
  ShoppingBagIcon,
  Squares2X2Icon,
  TrashIcon,
} from "@heroicons/react/24/outline";

import { PageHeader } from "@/components/ui-blocks";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createBlankPlaybook, isBuiltinPlaybookId, type Playbook, type PlaybookId } from "@/lib/kiosk-rule-playbooks";
import { deletePlaybook, listPlaybooks, upsertPlaybook } from "@/lib/kiosk-rule-storage";

const PLAYBOOK_ICONS: Partial<Record<PlaybookId, typeof ShoppingBagIcon>> = {
  ordering: ShoppingBagIcon,
  booking: CalendarDaysIcon,
  faq: ChatBubbleLeftRightIcon,
  vision: ClockIcon,
};

export function KioskRulesIndexClient() {
  const router = useRouter();
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [pendingDelete, setPendingDelete] = useState<Playbook | null>(null);

  useEffect(() => {
    setPlaybooks(listPlaybooks());
  }, []);

  useEffect(() => {
    if (!pendingDelete) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPendingDelete(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingDelete]);

  const addRules = () => {
    const playbook = createBlankPlaybook();
    upsertPlaybook(playbook);
    router.push(`/kiosk-rules/${playbook.id}`);
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    setPlaybooks(listPlaybooks(deletePlaybook(pendingDelete.id)));
    setPendingDelete(null);
  };

  return (
    <div className="flex flex-col gap-4 px-4 md:gap-6 lg:px-6">
      <PageHeader
        title="Kiosk rules"
        subtitle="Pick a playbook to map the flow. Map only — live kiosk stays the same."
        titleAction={
          <Button type="button" onClick={addRules}>
            <PlusIcon className="size-4" />
            Add new rules
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {playbooks.map((playbook) => {
          const Icon = PLAYBOOK_ICONS[playbook.id] ?? Squares2X2Icon;
          const custom = !isBuiltinPlaybookId(playbook.id);
          return (
            <div key={playbook.id} className="relative">
              <Link href={`/kiosk-rules/${playbook.id}`} className="group block">
                <Card className="h-full transition-colors group-hover:border-orange-300 group-hover:bg-orange-50/40">
                  <CardHeader>
                    <div className="flex size-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600 ring-1 ring-orange-100">
                      <Icon className="size-5" aria-hidden />
                    </div>
                    <CardTitle className="mt-3">{playbook.label}</CardTitle>
                    <CardDescription>{playbook.title}</CardDescription>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">{playbook.summary}</CardContent>
                </Card>
              </Link>
              {custom ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setPendingDelete(playbook);
                  }}
                  className="absolute top-3 right-3 rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-red-600"
                  aria-label={`Delete ${playbook.label}`}
                >
                  <TrashIcon className="size-4" />
                </button>
              ) : null}
            </div>
          );
        })}

        <button type="button" onClick={addRules} className="text-left">
          <Card className="flex h-full min-h-[11.5rem] items-center justify-center border-dashed border-slate-300 bg-slate-50/60 py-8 transition-colors hover:border-orange-300 hover:bg-orange-50/40">
            <div className="flex flex-col items-center gap-2 px-6 text-center">
              <div className="flex size-10 items-center justify-center rounded-xl bg-white text-orange-600 ring-1 ring-orange-100">
                <PlusIcon className="size-5" aria-hidden />
              </div>
              <p className="text-sm font-semibold text-slate-900">Add new rules</p>
              <p className="text-sm text-muted-foreground">Create another playbook map.</p>
            </div>
          </Card>
        </button>
      </div>

      {pendingDelete ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Close delete confirmation"
            onClick={() => setPendingDelete(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-rules-title"
            className="relative z-10 w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl"
          >
            <h2 id="delete-rules-title" className="text-lg font-semibold text-slate-900">
              Delete these rules?
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              “{pendingDelete.label}” will be removed. This only deletes the map — the live kiosk
              stays the same.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setPendingDelete(null)}>
                Cancel
              </Button>
              <Button type="button" variant="danger" onClick={confirmDelete}>
                Delete
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
