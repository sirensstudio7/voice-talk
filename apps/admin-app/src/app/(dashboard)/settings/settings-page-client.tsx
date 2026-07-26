"use client";

import { PageHeader } from "@/components/ui";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";

export function SettingsPageClient() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        subtitle="Manage your account preferences."
      />
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Your signed-in account details.</CardDescription>
        </CardHeader>
        <div className="px-6 pb-6">
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Email</dt>
              <dd className="mt-1 text-sm">{user?.email ?? "—"}</dd>
            </div>
            {user?.name ? (
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Name</dt>
                <dd className="mt-1 text-sm">{user.name}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      </Card>
    </div>
  );
}
