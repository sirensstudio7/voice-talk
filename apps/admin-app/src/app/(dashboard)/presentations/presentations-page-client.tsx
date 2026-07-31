"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PlusIcon, PresentationChartBarIcon, TrashIcon } from "@heroicons/react/24/outline";

import { PageHeader } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { api, type Presentation } from "@/lib/api";
import { useAuth } from "@/lib/auth";

function statusLabel(status: string) {
  return status.replace(/_/g, " ");
}

export function PresentationsPageClient() {
  const router = useRouter();
  const { token, business } = useAuth();
  const [items, setItems] = useState<Presentation[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    if (!token || !business) return;
    setLoading(true);
    try {
      setItems(await api.listPresentations(token, business.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [token, business]);

  const create = async () => {
    if (!token || !business || !title.trim()) return;
    setCreating(true);
    setError("");
    try {
      const created = await api.createPresentation(token, business.id, {
        title: title.trim(),
        language: "en",
      });
      setTitle("");
      router.push(`/presentations/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  };

  const remove = async (id: string) => {
    if (!token || !business) return;
    if (!window.confirm("Archive this presentation?")) return;
    await api.deletePresentation(token, business.id, id);
    await load();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Presenter"
        subtitle="Upload decks, generate narration, and run live AI presentation sessions."
        action={
          <div className="flex flex-wrap items-end gap-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="New presentation title"
              className="h-9 rounded-md border border-border bg-background px-3 text-sm"
            />
            <Button onClick={() => void create()} disabled={creating || !title.trim()}>
              <PlusIcon className="h-4 w-4" />
              Create
            </Button>
          </div>
        }
      />

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <Card className="border-dashed py-12 text-center shadow-none">
          <PresentationChartBarIcon className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">No presentation found</p>
          <p className="mt-1 text-sm text-muted-foreground">Create your first presentation</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <Card key={item.id} className="gap-0 py-0 shadow-none">
              <CardHeader className="flex-row items-center justify-between px-4 py-3">
                <Link href={`/presentations/${item.id}`} className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{item.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {statusLabel(item.status)}
                    {item.total_slides ? ` · ${item.total_slides} slides` : ""}
                    {item.estimated_duration
                      ? ` · ~${Math.round(item.estimated_duration / 60)} min`
                      : ""}
                    {` · updated ${new Date(item.updated_at).toLocaleString()}`}
                  </p>
                </Link>
                <div className="flex shrink-0 gap-2">
                  {item.status === "ready" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => router.push(`/presentations/${item.id}`)}
                    >
                      Open
                    </Button>
                  ) : null}
                  <Button size="icon" variant="ghost" onClick={() => void remove(item.id)}>
                    <TrashIcon className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
