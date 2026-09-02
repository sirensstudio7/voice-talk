"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeftIcon,
  Bars3BottomLeftIcon,
  DocumentTextIcon,
  EyeIcon,
  PencilIcon,
  PlusIcon,
  TagIcon,
} from "@heroicons/react/24/outline";

import { PageHeader } from "@voicetalk/ui";
import { Button } from "@voicetalk/ui/button";
import { Card, CardContent, CardHeader } from "@voicetalk/ui/card";
import { useSidebar } from "@voicetalk/ui/sidebar";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createHttpClient } from '@voicetalk/api-client';
// } from "@/lib/api";
import { adminPath } from "@/lib/admin-path";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";

import {
  CATEGORY_HINTS,
  CATEGORY_OPTIONS,
  CategoryBadge,
  CategoryChipGroup,
  emptyForm,
  type KnowledgeFormValues,
} from "./knowledge-shared";

function FormSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof TagIcon;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl py-5">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-500">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export function KnowledgeFormPageClient({ entryId }: { entryId?: string }) {
  const router = useRouter();
  const { token, business } = useAuth();
  const { state: sidebarState, isMobile } = useSidebar();
  const isEditing = Boolean(entryId);

  const [form, setForm] = useState<KnowledgeFormValues>(emptyForm);
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!isEditing || !token || !business || !entryId) return;

    let cancelled = false;

    const loadEntry = async () => {
      setLoading(true);
      setNotFound(false);
      try {
        const entries = await api.listKnowledge(token, business.id);
        if (cancelled) return;

        const entry = entries.find((item) => item.id === entryId);
        if (!entry) {
          setNotFound(true);
          return;
        }

        setForm({ category: entry.category, title: entry.title ?? "", content: entry.content });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadEntry();
    return () => {
      cancelled = true;
    };
  }, [isEditing, token, business, entryId]);

  const categoryHint = useMemo(() => {
    if (CATEGORY_OPTIONS.includes(form.category as (typeof CATEGORY_OPTIONS)[number])) {
      return CATEGORY_HINTS[form.category as (typeof CATEGORY_OPTIONS)[number]];
    }
    return CATEGORY_HINTS.General;
  }, [form.category]);

  const trimmedCategory = form.category.trim();
  const trimmedTitle = form.title.trim();
  const trimmedContent = form.content.trim();
  const isValid =
    trimmedCategory.length > 0 && trimmedTitle.length > 0 && trimmedContent.length > 0;

  const footerStyle = {
    left: isMobile
      ? "0px"
      : sidebarState === "collapsed"
        ? "var(--sidebar-width-icon)"
        : "var(--sidebar-width)",
  } as const;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || !business || !isValid) return;

    setSaving(true);
    try {
      const payload = {
        category: trimmedCategory,
        title: trimmedTitle,
        content: trimmedContent,
      };

      if (isEditing && entryId) {
        await api.updateKnowledge(token, business.id, entryId, payload);
      } else {
        await api.createKnowledge(token, business.id, payload);
      }

      router.push(adminPath(business.slug, "/knowledge"));
    } finally {
      setSaving(false);
    }
  };

  if (notFound) {
    return (
      <div className="space-y-6">
        <div className="flex items-start gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="mt-0.5 shrink-0 text-muted-foreground"
            asChild
          >
            <Link href={adminPath(business?.slug ?? "", "/knowledge")} aria-label="Back to knowledge">
              <ArrowLeftIcon />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <PageHeader title="Entry not found" subtitle="This knowledge entry may have been deleted." />
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="max-w-2xl space-y-6 pb-24">
        <PageHeader
          title={isEditing ? "Edit entry" : "Add entry"}
          subtitle={
            isEditing
              ? "Update what Lorescale knows about your business."
              : "A short fact Lorescale can reference in conversation."
          }
        />

        {loading ? (
          <div className="space-y-4">
            <div className="h-36 animate-pulse rounded-2xl bg-slate-100" />
            <div className="h-52 animate-pulse rounded-2xl bg-slate-100" />
          </div>
        ) : (
          <form id="knowledge-entry-form" onSubmit={handleSubmit} className="space-y-4">
            <FormSection
              icon={TagIcon}
              title="Category"
              description="Group related facts so Lorescale can find the right context quickly."
            >
              <CategoryChipGroup
                value={form.category}
                onChange={(category) => setForm({ ...form, category })}
              />
              <p className="mt-3 text-xs leading-relaxed text-slate-500">{categoryHint.description}</p>
            </FormSection>

            <FormSection
              icon={DocumentTextIcon}
              title="Title"
              description="A short label so you can find this entry quickly in your list."
            >
              <input
                id="knowledge-title"
                type="text"
                maxLength={200}
                required
                className={cn(
                  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition-colors",
                  "placeholder:text-slate-400 focus-visible:border-orange-300 focus-visible:ring-2 focus-visible:ring-orange-500/20",
                )}
                placeholder={categoryHint.titleExample}
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
              />
              <p className="mt-2 text-xs text-slate-500">
                A short label for your list — Lorescale uses the content field in conversation.
              </p>
            </FormSection>

            <FormSection
              icon={Bars3BottomLeftIcon}
              title="Content"
              description="One clear fact per entry works best — keep it concise and specific."
            >
              <textarea
                id="knowledge-content"
                required
                className={cn(
                  "min-h-36 w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm leading-relaxed text-slate-900 outline-none transition-colors",
                  "placeholder:text-slate-400 focus-visible:border-orange-300 focus-visible:ring-2 focus-visible:ring-orange-500/20",
                )}
                placeholder={categoryHint.example}
                value={form.content}
                onChange={(event) => setForm({ ...form, content: event.target.value })}
              />
              <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-500">
                <span>Example: {categoryHint.example}</span>
                <span className="shrink-0 tabular-nums">{form.content.length} chars</span>
              </div>
            </FormSection>

            {trimmedCategory && trimmedContent ? (
              <section className="rounded-2xl bg-slate-50 py-5">
                <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <EyeIcon className="h-3.5 w-3.5" />
                  Preview
                </div>
                <Card className="gap-0 border-0 py-0 shadow-none">
                  <CardHeader className="px-4 py-3">
                    <CategoryBadge category={trimmedCategory} />
                  </CardHeader>
                  <CardContent className="space-y-1 px-4 pb-4 pt-0">
                    {trimmedTitle ? (
                      <p className="text-sm font-semibold text-foreground">{trimmedTitle}</p>
                    ) : null}
                    <p
                      className={cn(
                        "text-sm leading-relaxed",
                        trimmedTitle ? "text-muted-foreground" : "text-foreground",
                      )}
                    >
                      {trimmedContent}
                    </p>
                  </CardContent>
                </Card>
              </section>
            ) : null}
          </form>
        )}
      </div>

      {!loading ? (
        <footer
          style={footerStyle}
          className="fixed bottom-0 right-0 z-20 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
        >
          <div className="flex w-full items-center justify-between gap-3 px-4 py-3 lg:px-6">
            <Button type="button" variant="outline" asChild>
              <Link href={adminPath(business?.slug ?? "", "/knowledge")}>Cancel</Link>
            </Button>
            <Button type="submit" form="knowledge-entry-form" disabled={saving || !isValid}>
              {isEditing ? (
                <>
                  <PencilIcon />
                  {saving ? "Saving…" : "Save changes"}
                </>
              ) : (
                <>
                  <PlusIcon />
                  {saving ? "Adding…" : "Add entry"}
                </>
              )}
            </Button>
          </div>
        </footer>
      ) : null}
    </>
  );
}
