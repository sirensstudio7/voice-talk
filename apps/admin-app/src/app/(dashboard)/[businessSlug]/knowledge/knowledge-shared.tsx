"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDownIcon,
} from "@heroicons/react/24/outline";

import { Badge } from "@voicetalk/ui";
import { cn } from "@/lib/cn";
import type { KnowledgeEntry } from "@/lib/api";

export const CATEGORY_OPTIONS = ["General", "Hours", "Menu", "Policies", "Payment"] as const;

export const CATEGORY_HINTS: Record<
  (typeof CATEGORY_OPTIONS)[number],
  { description: string; titleExample: string; example: string }
> = {
  General: {
    description: "General facts about your business.",
    titleExample: "About us",
    example: "We're a family-owned café in downtown Jakarta.",
  },
  Hours: {
    description: "Opening hours, closures, and special schedules.",
    titleExample: "Weekday hours",
    example: "We are open daily from 7:00 AM to 9:00 PM.",
  },
  Menu: {
    description: "Items, ingredients, substitutions, and dietary info.",
    titleExample: "Oat milk options",
    example: "Our oat milk latte can be made decaf on request.",
  },
  Policies: {
    description: "Returns, refunds, reservations, and other rules.",
    titleExample: "Custom order policy",
    example: "All sales are final on custom cake orders.",
  },
  Payment: {
    description: "Accepted payment methods and billing details.",
    titleExample: "Accepted payments",
    example: "We accept cash, cards, and QRIS.",
  },
};

export const emptyForm = {
  category: "",
  title: "",
  content: "",
};

export type KnowledgeFormValues = typeof emptyForm;

export const inputClassName =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring";

const CATEGORY_COLORS: Record<string, string> = {
  General: "border-slate-200 bg-slate-100 text-slate-700",
  Hours: "border-sky-200 bg-sky-50 text-sky-700",
  Menu: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Policies: "border-violet-200 bg-violet-50 text-violet-700",
  Payment: "border-amber-200 bg-amber-50 text-amber-800",
};

const FALLBACK_CATEGORY_COLORS = [
  "border-rose-200 bg-rose-50 text-rose-700",
  "border-cyan-200 bg-cyan-50 text-cyan-700",
  "border-indigo-200 bg-indigo-50 text-indigo-700",
  "border-pink-200 bg-pink-50 text-pink-700",
  "border-teal-200 bg-teal-50 text-teal-700",
] as const;

function hashCategory(category: string) {
  let hash = 0;
  for (let index = 0; index < category.length; index += 1) {
    hash = (hash + category.charCodeAt(index) * (index + 1)) % 1000;
  }
  return hash;
}

export function getCategoryColor(category: string) {
  return (
    CATEGORY_COLORS[category] ??
    FALLBACK_CATEGORY_COLORS[hashCategory(category) % FALLBACK_CATEGORY_COLORS.length]
  );
}

export function getEntryLabel(entry: Pick<KnowledgeEntry, "title" | "content">) {
  const title = entry.title?.trim();
  if (title) return title;

  const content = entry.content.trim();
  if (content.length <= 80) return content;
  return `${content.slice(0, 77)}…`;
}

export function groupByCategory(entries: KnowledgeEntry[]) {
  const groups = new Map<string, KnowledgeEntry[]>();
  for (const entry of entries) {
    const existing = groups.get(entry.category) ?? [];
    existing.push(entry);
    groups.set(entry.category, existing);
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, items]) => ({
      category,
      items: [...items].sort((a, b) => a.sort_order - b.sort_order),
    }));
}

export function CategoryBadge({ category }: { category: string }) {
  return (
    <Badge variant="outline" className={cn("font-normal", getCategoryColor(category))}>
      {category}
    </Badge>
  );
}

export function CategoryFilterPill({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "bg-slate-900 text-white"
          : "bg-white text-slate-600 ring-1 ring-slate-200/80 hover:bg-slate-100",
        !active && count === 0 && "opacity-50",
      )}
    >
      {label}
      {count > 0 ? ` · ${count}` : ""}
    </button>
  );
}

export function CategoryChipGroup({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const options = useMemo(() => {
    const trimmed = value.trim();
    if (!trimmed || CATEGORY_OPTIONS.includes(trimmed as (typeof CATEGORY_OPTIONS)[number])) {
      return [...CATEGORY_OPTIONS];
    }
    return [trimmed, ...CATEGORY_OPTIONS];
  }, [value]);

  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Category">
      {options.map((option) => {
        const selected = option === value;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium transition-all",
              selected
                ? cn(getCategoryColor(option), "ring-2 ring-offset-1 ring-slate-900/10")
                : "bg-white text-slate-600 ring-1 ring-slate-200/80 hover:bg-slate-50",
            )}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

export function CategorySelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const options = useMemo(() => {
    if (CATEGORY_OPTIONS.includes(value as (typeof CATEGORY_OPTIONS)[number])) {
      return [...CATEGORY_OPTIONS];
    }
    return [value, ...CATEGORY_OPTIONS];
  }, [value]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "flex w-full items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2.5 text-left text-sm transition-colors",
          open ? "border-ring ring-2 ring-ring/20" : "border-input hover:border-border",
        )}
      >
        <span className="font-medium text-foreground">{value}</span>
        <ChevronDownIcon
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <ul
          role="listbox"
          aria-labelledby={id}
          className="absolute z-20 mt-1.5 max-h-48 w-full overflow-auto rounded-xl border border-border bg-popover py-1 shadow-sm"
        >
          {options.map((option) => {
            const selected = option === value;
            return (
              <li key={option} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(option);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center px-3 py-2.5 text-sm transition-colors",
                    selected
                      ? "bg-accent font-medium text-accent-foreground"
                      : "text-foreground hover:bg-accent/50",
                  )}
                >
                  {option}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
