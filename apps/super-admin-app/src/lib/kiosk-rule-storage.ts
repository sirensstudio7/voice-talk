import type { RuleEdge, RuleNode } from "@/components/kiosk-rule-graph";
import {
  clonePlaybook,
  DEFAULT_PLAYBOOKS,
  isBuiltinPlaybookId,
  PLAYBOOK_STORAGE_KEY,
  PLAYBOOK_STORAGE_LEGACY_KEYS,
  type Playbook,
} from "@/lib/kiosk-rule-playbooks";

export type PlaybookOverride = {
  nodes: RuleNode[];
  edges: RuleEdge[];
  label?: string;
  title?: string;
  summary?: string;
};

export type PlaybookStore = {
  maps: Record<string, PlaybookOverride>;
  custom: Playbook[];
};

function emptyStore(): PlaybookStore {
  return { maps: {}, custom: [] };
}

function parseStore(raw: string): PlaybookStore | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const data = parsed as Record<string, unknown>;
    if (Array.isArray(data.custom) || data.maps) {
      return {
        maps: data.maps && typeof data.maps === "object" ? (data.maps as PlaybookStore["maps"]) : {},
        custom: Array.isArray(data.custom)
          ? data.custom.filter((item): item is Playbook => Boolean(item && typeof item === "object" && "id" in item))
          : [],
      };
    }
    const maps: PlaybookStore["maps"] = {};
    for (const [id, value] of Object.entries(data)) {
      if (!value || typeof value !== "object") continue;
      const override = value as PlaybookOverride;
      if (!Array.isArray(override.nodes)) continue;
      maps[id] = override;
    }
    return { maps, custom: [] };
  } catch {
    return null;
  }
}

export function loadPlaybookStore(): PlaybookStore {
  if (typeof window === "undefined") return emptyStore();
  const keys = [PLAYBOOK_STORAGE_KEY, ...PLAYBOOK_STORAGE_LEGACY_KEYS];
  for (const key of keys) {
    const raw = window.localStorage.getItem(key);
    if (!raw) continue;
    const parsed = parseStore(raw);
    if (parsed) return parsed;
  }
  return emptyStore();
}

export function savePlaybookStore(store: PlaybookStore): void {
  window.localStorage.setItem(PLAYBOOK_STORAGE_KEY, JSON.stringify(store));
}

function applyOverride(playbook: Playbook, override?: PlaybookOverride): Playbook {
  const next = clonePlaybook(playbook);
  if (!override) return next;
  if (override.nodes?.length) next.nodes = override.nodes.map((item) => ({ ...item }));
  if (override.edges) next.edges = override.edges.map((item) => ({ ...item }));
  if (override.label?.trim()) next.label = override.label;
  if (override.title?.trim()) next.title = override.title;
  if (override.summary?.trim()) next.summary = override.summary;
  return next;
}

export function listPlaybooks(store = loadPlaybookStore()): Playbook[] {
  const builtIn = DEFAULT_PLAYBOOKS.map((item) => applyOverride(item, store.maps[item.id]));
  const custom = store.custom.map((item) => clonePlaybook(item));
  return [...builtIn, ...custom];
}

export function getPlaybook(id: string, store = loadPlaybookStore()): Playbook | null {
  return listPlaybooks(store).find((item) => item.id === id) ?? null;
}

export function upsertPlaybook(playbook: Playbook, store = loadPlaybookStore()): PlaybookStore {
  const next: PlaybookStore = {
    maps: { ...store.maps },
    custom: store.custom.map((item) => clonePlaybook(item)),
  };
  if (isBuiltinPlaybookId(playbook.id)) {
    next.maps[playbook.id] = {
      nodes: playbook.nodes.map((item) => ({ ...item })),
      edges: playbook.edges.map((item) => ({ ...item })),
      label: playbook.label,
      title: playbook.title,
      summary: playbook.summary,
    };
  } else {
    const index = next.custom.findIndex((item) => item.id === playbook.id);
    const copy = clonePlaybook(playbook);
    if (index >= 0) next.custom[index] = copy;
    else next.custom.push(copy);
  }
  savePlaybookStore(next);
  return next;
}

export function deletePlaybook(id: string, store = loadPlaybookStore()): PlaybookStore {
  if (isBuiltinPlaybookId(id)) return store;
  const next = {
    maps: { ...store.maps },
    custom: store.custom.filter((item) => item.id !== id).map((item) => clonePlaybook(item)),
  };
  savePlaybookStore(next);
  return next;
}
