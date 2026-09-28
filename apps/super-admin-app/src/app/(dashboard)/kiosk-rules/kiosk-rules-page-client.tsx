"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeftIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
  PlusIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

import {
  KioskRuleGraph,
  type KioskRuleGraphHandle,
  RULE_NODE_W,
  type RuleNode,
  type RuleNodeKind,
} from "@/components/kiosk-rule-graph";
import { Button } from "@/components/ui/button";
import {
  clonePlaybook,
  createBlankPlaybook,
  DEFAULT_PLAYBOOKS,
  isBuiltinPlaybookId,
  type Playbook,
  type PlaybookId,
} from "@/lib/kiosk-rule-playbooks";
import { getPlaybook, upsertPlaybook } from "@/lib/kiosk-rule-storage";

export function KioskRulesPageClient({ playbookId }: { playbookId: PlaybookId }) {
  const defaults = DEFAULT_PLAYBOOKS;
  const [hydrated, setHydrated] = useState(false);
  const [playbook, setPlaybook] = useState<Playbook | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [linkTo, setLinkTo] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [scale, setScale] = useState(1);
  const graphRef = useRef<KioskRuleGraphHandle | null>(null);

  useEffect(() => {
    setPlaybook(getPlaybook(playbookId));
    setHydrated(true);
  }, [playbookId]);

  const selected = playbook?.nodes.find((node) => node.id === selectedId) ?? null;
  const outgoing = selected && playbook ? playbook.edges.filter((edge) => edge.from === selected.id) : [];

  const updatePlaybook = (patch: (current: Playbook) => Playbook) => {
    setPlaybook((current) => {
      if (!current) return current;
      const next = patch(current);
      upsertPlaybook(next);
      return next;
    });
  };

  const patchNode = (id: string, changes: Partial<RuleNode>) => {
    updatePlaybook((current) => ({
      ...current,
      nodes: current.nodes.map((node) => (node.id === id ? { ...node, ...changes } : node)),
    }));
  };

  const addNode = (kind: Extract<RuleNodeKind, "action" | "addon">) => {
    const id = `custom-${crypto.randomUUID().slice(0, 8)}`;
    const origin = selected ?? playbook.nodes[playbook.nodes.length - 1];
    const node: RuleNode = {
      id,
      label: kind === "addon" ? "New add-on" : "New step",
      hint: "Notes for this step. Does not change the live kiosk.",
      kind,
      builtIn: false,
      x: (origin?.x ?? 32) + RULE_NODE_W + 40,
      y: origin?.y ?? 168,
    };
    updatePlaybook((current) => ({
      ...current,
      nodes: [...current.nodes, node],
      edges: origin ? [...current.edges, { from: origin.id, to: id }] : current.edges,
    }));
    setSelectedId(id);
  };

  const removeNode = () => {
    if (!selected || selected.builtIn) return;
    const id = selected.id;
    updatePlaybook((current) => ({
      ...current,
      nodes: current.nodes.filter((node) => node.id !== id),
      edges: current.edges.filter((edge) => edge.from !== id && edge.to !== id),
    }));
    setSelectedId(null);
  };

  const addLink = () => {
    if (!selected || !linkTo || linkTo === selected.id) return;
    const exists = playbook.edges.some((edge) => edge.from === selected.id && edge.to === linkTo);
    if (exists) return;
    updatePlaybook((current) => ({
      ...current,
      edges: [...current.edges, { from: selected.id, to: linkTo, label: linkLabel.trim() || undefined }],
    }));
    setLinkTo("");
    setLinkLabel("");
  };

  const removeLink = (to: string) => {
    if (!selected) return;
    updatePlaybook((current) => ({
      ...current,
      edges: current.edges.filter((edge) => !(edge.from === selected.id && edge.to === to)),
    }));
  };

  const resetPlaybook = () => {
    const fresh = isBuiltinPlaybookId(playbookId)
      ? clonePlaybook(defaults.find((item) => item.id === playbookId)!)
      : { ...createBlankPlaybook(), id: playbookId, label: playbook?.label ?? "New rules" };
    upsertPlaybook(fresh);
    setPlaybook(fresh);
    setSelectedId(null);
  };

  const dirty = useMemo(() => {
    if (!hydrated || !playbook) return false;
    const fresh = isBuiltinPlaybookId(playbookId)
      ? defaults.find((item) => item.id === playbookId)
      : createBlankPlaybook();
    if (!fresh) return false;
    return (
      JSON.stringify({ nodes: playbook.nodes, edges: playbook.edges }) !==
      JSON.stringify({ nodes: fresh.nodes, edges: fresh.edges })
    );
  }, [defaults, hydrated, playbook, playbookId]);

  if (hydrated && !playbook) {
    return (
      <div className="flex flex-col items-start gap-3 px-4 py-10 lg:px-6">
        <p className="text-sm text-slate-600">This playbook was not found.</p>
        <Link href="/kiosk-rules" className="text-sm font-medium text-orange-600 hover:text-orange-700">
          Back to all playbooks
        </Link>
      </div>
    );
  }

  if (!playbook) return null;

  return (
    <div className="-mx-4 flex min-h-[calc(100vh-7.5rem)] flex-col lg:-mx-6">
      <div className="border-b border-slate-200 bg-white px-4 py-3 lg:px-6">
        <Link
          href="/kiosk-rules"
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800"
        >
          <ArrowLeftIcon className="size-3.5" />
          All playbooks
        </Link>

        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {isBuiltinPlaybookId(playbook.id) ? (
                <h1 className="text-lg font-semibold tracking-tight text-slate-900">{playbook.label}</h1>
              ) : (
                <input
                  value={playbook.label}
                  onChange={(event) =>
                    updatePlaybook((current) => ({ ...current, label: event.target.value }))
                  }
                  className="min-w-[8rem] border-0 bg-transparent text-lg font-semibold tracking-tight text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-orange-500/30"
                  aria-label="Playbook name"
                />
              )}
              {dirty ? (
                <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-orange-700 uppercase">
                  Edited
                </span>
              ) : null}
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                Map only
              </span>
            </div>
            <p className="mt-1 max-w-xl text-sm leading-snug text-slate-500">{playbook.summary}</p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 bg-white">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="rounded-none"
                onClick={() => addNode("action")}
              >
                <PlusIcon className="size-3.5" />
                Add step
              </Button>
              <span className="w-px self-stretch bg-slate-200" aria-hidden />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="rounded-none"
                onClick={() => addNode("addon")}
              >
                <PlusIcon className="size-3.5" />
                Add add-on
              </Button>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!dirty}
              onClick={resetPlaybook}
              title={dirty ? "Restore this playbook’s default map" : "No changes to reset"}
            >
              Reset
            </Button>
          </div>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <KioskRuleGraph
          ref={graphRef}
          nodes={playbook.nodes}
          edges={playbook.edges}
          selectedId={selectedId}
          fitKey={playbookId}
          onScaleChange={setScale}
          onSelect={(id) => {
            setSelectedId(id);
            setLinkTo("");
            setLinkLabel("");
          }}
          onMove={(id, x, y) => patchNode(id, { x, y })}
        />

        <div className="pointer-events-auto absolute bottom-3 left-3 z-10 flex items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-full border border-slate-200 bg-white p-0.5 shadow-sm">
            <button
              type="button"
              onClick={() => graphRef.current?.zoomOut()}
              className="rounded-full p-1.5 text-slate-600 hover:bg-slate-100"
              aria-label="Zoom out"
            >
              <MagnifyingGlassMinusIcon className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => graphRef.current?.fitView()}
              className="min-w-[3.25rem] px-1 text-center text-[11px] font-medium tabular-nums text-slate-600 hover:bg-slate-100"
            >
              {Math.round(scale * 100)}%
            </button>
            <button
              type="button"
              onClick={() => graphRef.current?.zoomIn()}
              className="rounded-full p-1.5 text-slate-600 hover:bg-slate-100"
              aria-label="Zoom in"
            >
              <MagnifyingGlassPlusIcon className="size-4" />
            </button>
          </div>
          <p className="text-[11px] text-slate-400">Scroll to zoom</p>
        </div>

        {selected ? (
          <aside className="absolute top-3 right-3 w-[min(100%-1.5rem,20rem)] rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] font-semibold tracking-wide text-slate-400 uppercase">
                  {selected.builtIn ? "Built-in" : "Custom"}
                </p>
                <p className="text-sm font-semibold text-slate-900">{selected.label}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                <XMarkIcon className="size-4" />
              </button>
            </div>

            <div className="space-y-3">
              <label className="block space-y-1">
                <span className="text-xs font-medium text-slate-600">Label</span>
                <input
                  value={selected.label}
                  onChange={(event) => patchNode(selected.id, { label: event.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-orange-500/30"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-slate-600">Notes</span>
                <textarea
                  value={selected.hint}
                  onChange={(event) => patchNode(selected.id, { hint: event.target.value })}
                  rows={2}
                  className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-orange-500/30"
                />
              </label>
              {selected.tool ? (
                <p className="rounded-lg bg-slate-50 px-2.5 py-1.5 font-mono text-[11px] text-slate-500">
                  {selected.tool}
                </p>
              ) : null}
              {!selected.builtIn ? (
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-slate-600">Type</span>
                  <select
                    value={selected.kind}
                    onChange={(event) =>
                      patchNode(selected.id, { kind: event.target.value as RuleNodeKind })
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value="action">Step</option>
                    <option value="addon">Add-on</option>
                    <option value="start">Start</option>
                    <option value="end">End</option>
                  </select>
                </label>
              ) : null}

              <div className="space-y-2 border-t border-slate-100 pt-3">
                <p className="text-xs font-medium text-slate-600">Connect</p>
                <div className="flex gap-2">
                  <select
                    value={linkTo}
                    onChange={(event) => setLinkTo(event.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                  >
                    <option value="">Next node…</option>
                    {playbook.nodes
                      .filter((node) => node.id !== selected.id)
                      .map((node) => (
                        <option key={node.id} value={node.id}>
                          {node.label}
                        </option>
                      ))}
                  </select>
                  <Button type="button" variant="outline" size="sm" disabled={!linkTo} onClick={addLink}>
                    Link
                  </Button>
                </div>
                <input
                  value={linkLabel}
                  onChange={(event) => setLinkLabel(event.target.value)}
                  placeholder="Arrow label"
                  className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-orange-500/30"
                />
                {outgoing.map((edge) => {
                  const target = playbook.nodes.find((node) => node.id === edge.to);
                  return (
                    <div
                      key={`${edge.from}-${edge.to}`}
                      className="flex items-center justify-between text-xs text-slate-500"
                    >
                      <span className="truncate">
                        → {target?.label ?? edge.to}
                        {edge.label ? ` · ${edge.label}` : ""}
                      </span>
                      <button
                        type="button"
                        className="text-slate-400 hover:text-red-600"
                        onClick={() => removeLink(edge.to)}
                      >
                        Remove
                      </button>
                    </div>
                  );
                })}
              </div>

              {!selected.builtIn ? (
                <Button type="button" variant="ghost" className="w-full text-red-600" onClick={removeNode}>
                  Delete
                </Button>
              ) : null}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
