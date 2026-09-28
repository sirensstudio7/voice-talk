"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { api, type SharedPresentationLanding } from "@/lib/api";

export default function PresentationShareLandingPage({
  params,
}: {
  params: { shareToken: string };
}) {
  const router = useRouter();
  const routeParams = useParams<{ shareToken: string }>();
  const shareToken = String(routeParams?.shareToken ?? params.shareToken ?? "");

  const [detail, setDetail] = useState<SharedPresentationLanding | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!shareToken.trim()) return;
    let mounted = true;
    void api
      .getSharedPresentation(shareToken)
      .then((d) => {
        if (!mounted) return;
        setDetail(d);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Failed to load");
      });
    return () => {
      mounted = false;
    };
  }, [shareToken]);

  const onStart = async () => {
    setLoading(true);
    setError("");
    try {
      const session = await api.startSharedPresentation(shareToken);
      // Viewer page runs in the same admin-app UI, but without requiring admin login.
      router.push(`/present/${encodeURIComponent(shareToken)}/live/${session.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start presentation");
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4 text-foreground">
      <div className="w-full max-w-xl rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h1 className="text-lg font-semibold">AI Present</h1>
        {detail ? (
          <>
            <p className="mt-1 text-sm text-muted-foreground">{detail.title}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {detail.language.toUpperCase()} · ~{Math.max(1, Math.round(detail.estimated_duration / 60))} min
            </p>
          </>
        ) : null}

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

        <Button
          className="mt-5 w-full"
          size="lg"
          disabled={!detail || loading}
          onClick={() => void onStart()}
        >
          {loading ? "Starting…" : "Start presenting"}
        </Button>

        <p className="mt-3 text-center text-xs text-muted-foreground">
          Press Start to begin. You can ask questions during the Q&A stage.
        </p>
      </div>
    </div>
  );
}

