"use client";

import { PuzzlePieceIcon } from "@heroicons/react/24/outline";

import { PageHeader } from "@/components/ui-blocks";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AddOnsPage() {
  return (
    <div className="flex flex-col gap-4 px-4 md:gap-6 lg:px-6">
      <PageHeader
        title="Add-ons"
        subtitle="Platform catalog of optional features tenants can enable."
      />

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600 ring-1 ring-orange-100">
              <PuzzlePieceIcon className="size-5" aria-hidden />
            </div>
            <div>
              <CardTitle>Coming soon</CardTitle>
              <CardDescription>
                Manage add-on definitions, pricing, and entitlement flags from here.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          This section will list platform add-ons once the catalog and entitlement APIs are
          ready.
        </CardContent>
      </Card>
    </div>
  );
}
