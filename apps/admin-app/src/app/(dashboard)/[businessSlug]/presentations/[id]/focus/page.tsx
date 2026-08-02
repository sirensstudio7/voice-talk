import { Suspense } from "react";

import { PresentationFocusClient } from "./presentation-focus-client";

export default async function PresentationFocusPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense
      fallback={
        <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
          Loading focus view…
        </div>
      }
    >
      <PresentationFocusClient presentationId={id} />
    </Suspense>
  );
}
