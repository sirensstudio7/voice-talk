"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { adminPath } from "@/lib/admin-path";
import { useAuth } from "@/lib/auth";

const PptxDeckViewer = dynamic(
  () => import("@/components/pptx-deck-viewer").then((m) => m.PptxDeckViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-svh w-full items-center justify-center bg-background text-sm text-muted-foreground">
        Loading PowerPoint…
      </div>
    ),
  },
);

export function PresentationFocusClient({ presentationId }: { presentationId: string }) {
  const { token, business } = useAuth();
  const searchParams = useSearchParams();
  const initialSlide = Math.max(1, Number(searchParams.get("slide") || "1") || 1);
  const [slideNumber, setSlideNumber] = useState(initialSlide);

  // Don't wait on presentation metadata — start the deck as soon as auth is ready.
  if (!token || !business) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background text-sm text-muted-foreground">
        Loading focus view…
      </div>
    );
  }

  return (
    <div className="relative flex min-h-svh flex-col bg-background text-foreground">
      <div className="absolute right-3 top-3 z-20">
        <Button variant="outline" size="sm" asChild className="bg-background/90 backdrop-blur">
          <Link href={adminPath(business?.slug ?? "", `/presentations/${presentationId}/preview`)}>
            <XMarkIcon className="h-4 w-4" />
            Close
          </Link>
        </Button>
      </div>
      <PptxDeckViewer
        pptxUrl={api.presentationPptxUrl(business.id, presentationId)}
        authToken={token}
        slideNumber={slideNumber}
        onSlideChange={setSlideNumber}
        background="white"
        viewerMode="present"
        className="min-h-svh w-full flex-1"
      />
    </div>
  );
}
