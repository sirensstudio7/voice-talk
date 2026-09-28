"use client";

import { LiveSessionClient } from "../../../../(dashboard)/[businessSlug]/sessions/[id]/live/live-session-client";
import { useParams } from "next/navigation";

export default function PresentationShareLivePage({
  params,
}: {
  params: { shareToken: string; sessionId: string };
}) {
  const routeParams = useParams<{ shareToken: string; sessionId: string }>();
  const shareToken = String(routeParams?.shareToken ?? params.shareToken ?? "");
  const sessionId = String(routeParams?.sessionId ?? params.sessionId ?? "");

  if (!shareToken || !sessionId) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background text-sm text-muted-foreground">
        Session not found
      </div>
    );
  }

  return <LiveSessionClient sessionId={sessionId} shareToken={shareToken} />;
}

