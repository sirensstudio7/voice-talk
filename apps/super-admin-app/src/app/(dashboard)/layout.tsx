import { Suspense } from "react";

import { AuthGate } from "@/components/auth-gate";
import { Shell } from "@/components/shell";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <Suspense fallback={<div className="min-h-screen bg-background" />}>
        <Shell>{children}</Shell>
      </Suspense>
    </AuthGate>
  );
}
